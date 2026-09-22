/*
 * Sparxer — background service worker.
 * Owns the analysis pipeline: screenshot capture, provider calls, history
 * writes and state broadcasts. The popup is just a client, so closing it
 * no longer aborts a running request.
 */

import { get as getSettings, set as setSettings } from "../storage/settings.js";
import { getProvider } from "../providers/registry.js";
import { friendlyError } from "../core/errors.js";
import { questionFingerprint } from "../core/normalize.js";
import * as history from "../storage/history.js";

/* ---------------- state ---------------- */

const ports = new Set();

const state = {
  analyzing: null,   /* { label, startedAt } */
  lastResult: null,  /* full normalized result */
  detected: null,    /* latest detected question (filled by detection) */
  error: null        /* { message } */
};

let currentAbort = null;
let lastAction = null;

/* Question hashes analyzed recently (auto mode only) — guards against
 * DOM churn re-triggering the same question. Memory-only, cleared on
 * worker restart, refreshed on every detection. */
const recentHashes = new Map();
const RECENT_WINDOW_MS = 10 * 60 * 1000;

function post(port, message) {
  try {
    port.postMessage(message);
  } catch {
    /* port closed */
  }
}

function broadcastState() {
  for (const port of ports) post(port, { type: "state", state });
}

function setState(patch) {
  Object.assign(state, patch);
  broadcastState();
}

/* Restore the last result of this browser session when the worker wakes. */
chrome.storage.session.get("lastResult").then(({ lastResult }) => {
  if (lastResult && !state.lastResult) {
    state.lastResult = lastResult;
    broadcastState();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  /* Runs the legacy geminiKey -> settings migration early. */
  getSettings();
});

/* Re-register detector scripts on worker wake (belt and suspenders —
 * registrations persist, but nothing breaks if Chrome lost them). */
restoreSiteRegistrations();

async function restoreSiteRegistrations() {
  try {
    const settings = await getSettings();
    for (const site of settings.enabledSites) {
      await registerDetector(site.origin, site.hostname);
    }
  } catch {
    /* storage not ready — the next message will retry */
  }
}

/* ---------------- popup / panel connections ---------------- */

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "app") return;
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
  post(port, { type: "state", state });
});

/* ---------------- messages ---------------- */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case "analyze:screen": {
        const settings = await getSettings();
        if (!settings[settings.provider]?.apiKey) {
          sendResponse({ ok: false, error: "Add your API key in Settings first." });
          return;
        }
        startAnalysis({
          source: "screen",
          tabId: message.tabId,
          windowId: message.windowId,
          site: message.site || ""
        });
        sendResponse({ ok: true });
        return;
      }

      case "analyze:retry": {
        if (!lastAction) {
          sendResponse({ ok: false, error: "Nothing to retry." });
          return;
        }
        const settings = await getSettings();
        if (!settings[settings.provider]?.apiKey) {
          sendResponse({ ok: false, error: "Add your API key in Settings first." });
          return;
        }
        startAnalysis(lastAction);
        sendResponse({ ok: true });
        return;
      }

      case "cancel": {
        currentAbort?.abort();
        sendResponse({ ok: true });
        return;
      }

      case "analyze:question": {
        const settings = await getSettings();
        if (!settings[settings.provider]?.apiKey) {
          sendResponse({ ok: false, error: "Add your API key in Settings first." });
          return;
        }
        recentHashes.set(message.hash, Date.now());
        startAnalysis({ source: "detected", question: message.question });
        sendResponse({ ok: true });
        return;
      }

      case "question:detected": {
        const settings = await getSettings();
        const question = message.question;

        const allowed =
          settings.autoDetect &&
          question?.origin &&
          settings.enabledSites.some((s) => s.origin === question.origin);

        if (!allowed) {
          sendResponse({ ok: false });
          return;
        }

        state.detected = { ...question, hash: message.hash, at: Date.now() };
        broadcastState();

        if (settings.autoAnalyze && settings[settings.provider]?.apiKey) {
          const seenAt = recentHashes.get(message.hash);

          if (!seenAt || Date.now() - seenAt > RECENT_WINDOW_MS) {
            /* Reuse a stored result for the same question when we have one. */
            const stored = await history.findByHash(message.hash);
            if (stored) {
              recentHashes.set(message.hash, Date.now());
              state.lastResult = stored;
              broadcastState();
            } else {
              recentHashes.set(message.hash, Date.now());
              startAnalysis({ source: "detected", question });
            }
          }
        }

        sendResponse({ ok: true });
        return;
      }

      case "site:enable": {
        const { origin, hostname, tabId } = message;
        const settings = await getSettings();
        if (!settings.enabledSites.some((s) => s.origin === origin)) {
          await setSettings({
            enabledSites: [...settings.enabledSites, { origin, hostname }]
          });
        }
        await registerDetector(origin, hostname);

        /* Activate on the tab the user is looking at right now. */
        try {
          if (tabId) {
            await chrome.scripting.executeScript({
              target: { tabId },
              files: ["src/content/content.js"]
            });
          }
        } catch {
          /* the page may not allow it; the registered script covers reloads */
        }

        sendResponse({ ok: true });
        return;
      }

      case "site:disable": {
        const { origin, hostname } = message;
        const settings = await getSettings();
        await setSettings({
          enabledSites: settings.enabledSites.filter(
            (s) => s.origin !== origin
          )
        });
        try {
          await chrome.scripting.unregisterContentScripts({
            ids: [detectorId(hostname)]
          });
        } catch {
          /* wasn't registered */
        }
        sendResponse({ ok: true });
        return;
      }
    }
  })();

  return true; /* async sendResponse */
});

function detectorId(hostname) {
  return "sparxer-detect-" + hostname;
}

async function registerDetector(origin, hostname) {
  const id = detectorId(hostname);
  const registered = await chrome.scripting.getRegisteredContentScripts();
  if (registered.some((s) => s.id === id)) return;

  try {
    await chrome.scripting.registerContentScripts([
      {
        id,
        matches: [origin + "/*"],
        js: ["src/content/content.js"],
        runAt: "document_idle",
        persistAcrossSessions: true
      }
    ]);
  } catch {
    /* origin permission may have been revoked — registration needs it */
  }
}

/* ---------------- analysis ---------------- */

async function startAnalysis(action) {
  /* Supersede any in-flight request instead of queueing. */
  if (currentAbort) currentAbort.abort();

  const settings = await getSettings();
  const provider = getProvider(settings.provider);
  const providerSettings = settings[provider.id];

  const abort = new AbortController();
  currentAbort = abort;
  lastAction = action;

  const started = performance.now();
  setState({ analyzing: { label: provider.label, startedAt: Date.now() }, error: null });

  try {
    let input;
    let site = action.site || "";

    if (action.source === "screen") {
      const shot = await chrome.tabs.captureVisibleTab(action.windowId ?? null, {
        format: "jpeg",
        quality: settings.screenshotQuality
      });
      const comma = shot.indexOf(",");
      if (comma === -1) throw new Error("Invalid screenshot.");
      input = { imageBase64: shot.substring(comma + 1), mimeType: "image/jpeg" };
    } else {
      /* Text extracted from the page by the detector. */
      input = {
        questionText: action.question.text,
        identifier: action.question.identifier || ""
      };
      site = action.question.site || "";
    }

    const result = await provider.analyze(input, {
      apiKey: providerSettings.apiKey,
      model: providerSettings.model,
      includeWorking: settings.includeWorking,
      signal: abort.signal
    });

    const full = stampResult(result, {
      providerId: provider.id,
      action,
      site,
      startedAt: started
    });

    if (settings.saveHistory && full.answer) {
      await history.add(toHistoryEntry(full));
    }

    await chrome.storage.session.set({ lastResult: full });
    setState({ analyzing: null, lastResult: full, error: null });
  } catch (err) {
    /* A newer request may have superseded this one — leave its state alone. */
    if (currentAbort !== abort) return;

    setState({
      analyzing: null,
      error: { message: friendlyError(err), kind: err?.kind || "" }
    });
  } finally {
    if (currentAbort === abort) currentAbort = null;
  }
}

function stampResult(result, { providerId, action, site, startedAt }) {
  const question = result.question || action.question?.text || "";
  return {
    ...result,
    question,
    identifier: result.identifier || action.question?.identifier || "",
    provider: providerId,
    source: action.source,
    site,
    hash: question ? questionFingerprint(question).hash : "",
    timestampMs: Date.now(),
    durationMs: Math.round(performance.now() - startedAt)
  };
}

function toHistoryEntry(result) {
  return {
    id: crypto.randomUUID(),
    hash: result.hash,
    question: result.question,
    identifier: result.identifier,
    answer: result.answer,
    steps: result.steps,
    hint: result.hint,
    note: result.note,
    model: result.model,
    provider: result.provider,
    site: result.site,
    timestampMs: result.timestampMs
  };
}
