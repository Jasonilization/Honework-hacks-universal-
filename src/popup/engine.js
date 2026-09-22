/*
 * Analysis engine, popup-side entry point.
 *
 * In this commit the work still happens inside the popup; the next commit
 * moves it into the background service worker behind the same interface,
 * so the UI code doesn't change.
 */

import { get as getSettings } from "../storage/settings.js";
import { getProvider } from "../providers/registry.js";
import { ProviderError, ERROR_KINDS } from "../core/errors.js";
import { questionFingerprint } from "../core/normalize.js";

let currentAbort = null;

export function cancel() {
  currentAbort?.abort();
}

export async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

export async function analyzeScreen(onPhase = () => {}) {
  const settings = await getSettings();
  const provider = getProvider(settings.provider);
  const ps = settings[provider.id];

  if (!ps.apiKey) {
    throw new ProviderError(ERROR_KINDS.AUTH, "Add your API key in Settings first.");
  }

  const tab = await getActiveTab();
  const abort = new AbortController();
  currentAbort = abort;

  try {
    onPhase("capturing");

    const shot = await chrome.tabs.captureVisibleTab(null, {
      format: "jpeg",
      quality: settings.screenshotQuality
    });
    const comma = shot.indexOf(",");
    if (comma === -1) throw new Error("Invalid screenshot.");

    onPhase("analyzing");
    const started = performance.now();

    const result = await provider.analyze(
      { imageBase64: shot.substring(comma + 1), mimeType: "image/jpeg" },
      {
        apiKey: ps.apiKey,
        model: ps.model,
        includeWorking: settings.includeWorking,
        signal: abort.signal
      }
    );

    return stamp(result, {
      providerId: provider.id,
      source: "screen",
      site: hostnameOf(tab?.url),
      startedAt: started
    });
  } finally {
    if (currentAbort === abort) currentAbort = null;
  }
}

/* Attach the bookkeeping every result carries, wherever it came from. */
export function stamp(result, { providerId, source, site, startedAt, detected }) {
  const question = result.question || detected?.text || "";
  return {
    ...result,
    identifier: result.identifier || detected?.identifier || "",
    question,
    provider: providerId,
    source: source || "screen",
    site: site || detected?.site || "",
    hash: question ? questionFingerprint(question).hash : "",
    timestampMs: Date.now(),
    durationMs: Math.round(performance.now() - startedAt)
  };
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}
