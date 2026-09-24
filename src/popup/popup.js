/*
 * Sparxer — popup controller.
 * Presentation only: the analysis runs in the background service worker
 * (engine.js is the client), persistence lives in src/storage, and the
 * single provider is Chrome's built-in AI (src/providers/chrome-local.js).
 */

import { get as getSettings, set as setSettings, onChanged as onSettingsChanged } from "../storage/settings.js";
import * as history from "../storage/history.js";
import { getProvider } from "../providers/registry.js";
import { friendlyError } from "../core/errors.js";
import { applyTheme, watchSystem } from "./theme.js";
import { icons, el, fmtDuration, fmtTime } from "./ui.js";
import * as engine from "./engine.js";

const $ = (id) => document.getElementById(id);

const dom = {
  status: $("status"),
  statusText: $("statusText"),
  btnSidePanel: $("btnSidePanel"),
  btnSettings: $("btnSettings"),
  settingsPanel: $("settingsPanel"),
  detectedBar: $("detectedBar"),
  resultCard: $("resultCard"),
  btnAnalyze: $("btnAnalyze"),
  actionHint: $("actionHint"),
  themeSelect: $("themeSelect"),
  includeWorkingToggle: $("includeWorkingToggle"),
  saveHistoryToggle: $("saveHistoryToggle"),
  autoDetectToggle: $("autoDetectToggle"),
  autoAnalyzeToggle: $("autoAnalyzeToggle"),
  showIdentifierToggle: $("showIdentifierToggle"),
  btnSiteToggle: $("btnSiteToggle"),
  siteStatus: $("siteStatus"),
  siteToggleLabel: $("siteToggleLabel"),
  historySection: $("historySection"),
  historyList: $("historyList"),
  historySearch: $("historySearch"),
  historyEmpty: $("historyEmpty"),
  btnClearHistory: $("btnClearHistory"),
  diagWorker: $("diagWorker"),
  diagPopup: $("diagPopup"),
  diagTrace: $("diagTrace"),
  btnDiagRefresh: $("btnDiagRefresh"),
  btnDiagCopy: $("btnDiagCopy"),
  footVersion: $("footVersion")
};

let settings = null;
let historyEntries = [];
let historyQuery = "";
let currentState = null;
let builtinAvailable = null; /* null = still checking */

/* Built-in Chrome AI is the only engine — check it once, then refresh the UI. */
getProvider("chrome-local")
  .availability()
  .then((state) => {
    builtinAvailable = state !== "unavailable";
    if (settings) renderState(currentState || {});
  })
  .catch(() => {
    builtinAvailable = false;
    if (settings) renderState(currentState || {});
  });

/* ================================
   INIT
================================ */

init();

async function init() {
  settings = await getSettings();

  applyTheme(settings.theme);
  watchSystem(() => applyTheme(settings.theme));

  dom.footVersion.textContent = "v" + chrome.runtime.getManifest().version;

  wireActions();
  wireSettings();
  wireHistory();
  renderStatus(null);

  engine.onState(renderState);
  loadHistory();
}

/* ================================
   WORKER STATE -> UI
================================ */

function renderState(state) {
  const safe = state || {};
  currentState = state;
  renderStatus(safe);
  renderDetected(safe);
  renderButton(safe);

  if (safe.analyzing) {
    clearCard(); /* the button carries the loading state */
  } else if (safe.error) {
    renderError(safe.error.message);
  } else if (safe.lastResult) {
    renderResult(safe.lastResult);
  } else if (builtinAvailable === false) {
    renderUnavailable();
  } else {
    clearCard();
  }

  renderDiag(safe);
}

/* ================================
   ACTIONS
================================ */

function wireActions() {
  /* One button does everything: Analyze -> becomes the progress/cancel
   * control while a request is in flight, then returns. */
  dom.btnAnalyze.addEventListener("click", () => {
    if (currentState?.analyzing) {
      engine.cancel().catch(() => {});
      return;
    }
    run(engine.analyzePage);
  });

  /* Side panel (Chrome 116+): keep results visible while working through
   * questions. The worker broadcasts to every attached surface, so the
   * panel and the popup stay in sync. */
  if (dom.btnSidePanel && chrome.sidePanel?.open) {
    dom.btnSidePanel.hidden = false;
    dom.btnSidePanel.addEventListener("click", async () => {
      try {
        const tab = await engine.getActiveTab();
        if (tab) await chrome.sidePanel.open({ tabId: tab.id });
        window.close();
      } catch {
        /* panel API unavailable in this browser */
      }
    });
  }
}

async function run(action) {
  try {
    await action();
  } catch (err) {
    renderError(friendlyError(err));
    renderStatus({ error: { message: friendlyError(err) } });
  }
}

/* ================================
   STATUS
================================ */

function renderStatus(state) {
  const workerError = state?.error && !state?.analyzing;

  const value = state?.analyzing
    ? "analyzing"
    : workerError
      ? "error"
      : builtinAvailable === false
        ? "warn"
        : "ready";

  dom.status.dataset.state = value;
  dom.statusText.textContent =
    value === "analyzing"
      ? "Working…"
      : value === "error"
        ? "Error"
        : value === "warn"
          ? "No built-in AI"
          : builtinAvailable === null
            ? "Checking…"
            : "Ready";
}

/* The analyze button IS the loading indicator: label, spinner and
 * phase live inside it, and clicking it again cancels. */
let lastButtonHtml = "";

function renderButton(state) {
  const btn = dom.btnAnalyze;
  const analyzing = !!state?.analyzing;

  /* The worker drives the label: "Reading page…", "Solving 4A…",
   * "Downloading model — 42%"… */
  const html = analyzing
    ? `<span class="spinner" aria-hidden="true"></span>` +
      escapeHtml(state.analyzing.label || "Analyzing…")
    : "Analyze question";

  if (html === lastButtonHtml) return; /* avoid needless re-paints */
  lastButtonHtml = html;

  btn.classList.toggle("loading", analyzing);
  btn.disabled = false; /* stays clickable so it can cancel */
  btn.innerHTML = html;

  if (analyzing) {
    btn.setAttribute("aria-busy", "true");
    btn.title = "Click to cancel";
  } else {
    btn.removeAttribute("aria-busy");
    btn.title = "";
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/* ================================
   DETECTED QUESTION
================================ */

function renderDetected(state) {
  const detected = state?.detected;
  dom.detectedBar.replaceChildren();

  if (!detected) {
    dom.detectedBar.hidden = true;
    return;
  }

  /* Bookwork check — answer straight from history, no AI call. */
  const bookwork = detected.bookworkCheck;
  if (bookwork) {
    dom.detectedBar.hidden = false;
    dom.detectedBar.append(el("span", { class: "chip", text: bookwork.identifier }));

    if (bookwork.entry) {
      dom.detectedBar.append(
        el("span", { class: "detected-text" },
          "Bookwork check — your answer for " + bookwork.identifier + ": ",
          el("span", { class: "detected-answer", text: bookwork.entry.answer || "" })
        ),
        el("button", {
          class: "btn btn-small",
          type: "button",
          text: "Copy",
          onclick: (ev) => copyAnswer(bookwork.entry.answer, ev.currentTarget)
        }),
        el("button", {
          class: "btn btn-small",
          type: "button",
          text: "Open",
          onclick: () => renderResult(bookwork.entry)
        })
      );
    } else {
      dom.detectedBar.append(
        el("span", {
          class: "detected-text",
          text: `Bookwork check for ${bookwork.identifier} — no saved answer in history.`
        }),
        el("button", {
          class: "btn btn-small",
          type: "button",
          text: "Search history",
          onclick: () => searchHistoryFor(bookwork.identifier)
        })
      );
    }
    return;
  }

  if (state?.lastResult?.hash === detected.hash) {
    dom.detectedBar.hidden = true;
    return;
  }

  dom.detectedBar.hidden = false;

  if (detected.identifier && settings.showIdentifier) {
    dom.detectedBar.append(el("span", { class: "chip", text: detected.identifier }));
  }
  dom.detectedBar.append(el("span", { class: "detected-text", text: detected.text }));

  dom.detectedBar.append(
    el("button", {
      class: "btn btn-small",
      type: "button",
      text: "Analyze",
      onclick: () => run(() => engine.analyzeDetected(detected))
    })
  );
}

function searchHistoryFor(code) {
  dom.settingsPanel.open = false;
  dom.historySearch.value = code;
  historyQuery = code;
  renderHistory();
  dom.historySearch.focus();
}

/* ================================
   RESULT CARD
================================ */

function clearCard() {
  dom.resultCard.hidden = true;
  dom.resultCard.replaceChildren();
}

/* The one failure state left: this Chrome doesn't have the built-in model. */
function renderUnavailable() {
  clearCard();
  dom.resultCard.hidden = false;
  dom.resultCard.append(
    el("h2", { class: "setup-title", text: "Chrome's built-in AI is needed" }),
    el("p", {
      class: "setup-text",
      text: "Update Chrome, then reopen this popup."
    })
  );
}

function renderResult(result) {
  clearCard();
  dom.resultCard.hidden = false;
  const card = dom.resultCard;

  /* context row */
  const context = el("div", { class: "card-context" });
  if (result.identifier && settings.showIdentifier) {
    context.append(el("span", { class: "chip", text: result.identifier }));
  }
  context.append(el("span", { class: "context-site", text: result.site || "This page" }));
  context.append(el("span", { class: "context-time", text: timeShort(result.timestampMs) }));
  card.append(context);

  if (result.question) {
    card.append(el("p", { class: "question-text", text: result.question }));
  }

  if (result.answer) {
    card.append(el("div", { class: "answer", text: result.answer }));
  } else if (result.note) {
    card.append(el("p", { class: "answer-note", text: result.note }));
  }

  /* actions */
  const actions = el("div", { class: "result-actions" });
  if (result.answer) {
    const copyBtn = el("button", {
      class: "btn btn-small",
      html: icons.copy + " Copy",
      onclick: () => copyAnswer(result.answer, copyBtn)
    });
    actions.append(copyBtn);
  }
  actions.append(
    el("button", {
      class: "btn btn-small",
      html: icons.retry + " Retry",
      onclick: () => run(engine.retry)
    })
  );
  card.append(actions);

  /* working */
  if (result.steps?.length) {
    const list = el("ol", { class: "steps" });
    for (const step of result.steps) list.append(el("li", { text: step }));
    card.append(
      el("details", { class: "working" },
        el("summary", { html: icons.chev + " Working" }),
        list
      )
    );
  }

  if (result.hint) {
    card.append(el("p", { class: "hint-line", text: "Hint: " + result.hint }));
  }

  /* meta */
  const meta = el("div", { class: "badge-row" });
  meta.append(el("span", { class: "badge-model", text: "Built-in AI" }));
  if (result.durationMs) meta.append(el("span", { text: fmtDuration(result.durationMs) }));
  card.append(meta);
}

function renderError(message) {
  clearCard();
  dom.resultCard.hidden = false;
  dom.resultCard.append(
    el("p", { class: "error-text", text: message }),
    el("button", {
      class: "btn btn-small",
      html: icons.retry + " Try again",
      onclick: () => run(engine.retry)
    })
  );
}

async function copyAnswer(text, button) {
  if (!button) return;
  try {
    await navigator.clipboard.writeText(text);
    const original = button.innerHTML;
    button.innerHTML = icons.check + " Copied";
    setTimeout(() => {
      button.innerHTML = original;
    }, 1200);
  } catch {
    button.textContent = "Copy failed";
    setTimeout(() => {
      button.innerHTML = original;
    }, 1200);
  }
}

function timeShort(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/* ================================
   DIAGNOSTICS
================================ */

function renderDiag(state) {
  const diag = state?.diag || {};
  const worker = diag.workerStatus;

  dom.diagWorker.textContent = worker
    ? `Worker: ${worker.state} — ${worker.note}`
    : "Worker: not checked yet (press Re-check)";

  const trace = diag.trace || [];
  dom.diagTrace.hidden = trace.length === 0;
  dom.diagTrace.textContent = trace
    .slice(-8)
    .map((line) => `${timeShort(line.t)}  ${line.step}${line.detail ? " — " + line.detail : ""}`)
    .join("\n");
}

async function refreshPopupDiag() {
  const status = await getProvider("chrome-local").status();
  dom.diagPopup.textContent = `Popup: ${status.state} — ${status.note}`;
  return status;
}

async function buildDiagReport() {
  const manifest = chrome.runtime.getManifest();
  const popup = await getProvider("chrome-local").status();
  const worker = currentState?.diag?.workerStatus || { state: "unknown", note: "not checked" };
  const trace = (currentState?.diag?.trace || [])
    .map((l) => `${timeShort(l.t)} ${l.step}${l.detail ? " — " + l.detail : ""}`)
    .join("\n");

  return [
    `Sparxer v${manifest.version}`,
    `Chrome: ${navigator.userAgent}`,
    `Worker context: ${worker.state} — ${worker.note}`,
    `Popup context: ${popup.state} — ${popup.note}`,
    `Sites enabled: ${settings.enabledSites.length}`,
    `autoDetect=${settings.autoDetect} autoAnalyze=${settings.autoAnalyze} saveHistory=${settings.saveHistory}`,
    "",
    "Trace:",
    trace || "(nothing ran yet)"
  ].join("\n");
}

/* ================================
   HISTORY
================================ */

function wireHistory() {
  dom.historySearch.addEventListener("input", () => {
    historyQuery = dom.historySearch.value;
    renderHistory();
  });

  dom.historyList.addEventListener("click", (event) => {
    const item = event.target.closest(".history-item");
    if (!item) return;

    const entry = historyEntries.find((e) => e.id === item.dataset.id);
    if (!entry) return;

    if (event.target.closest(".history-delete")) {
      history.remove(entry.id);
      return;
    }

    if (event.target.closest(".history-copy")) {
      copyAnswer(entry.answer, event.target.closest("button"));
      return;
    }

    if (event.target.closest(".history-open")) {
      renderResult(entry);
    }
  });

  dom.btnClearHistory.addEventListener("click", async () => {
    if (confirm("Clear all saved questions? This can't be undone.")) {
      await history.clear();
    }
  });

  history.onChanged(() => loadHistory());
}

async function loadHistory() {
  historyEntries = await history.list();
  renderHistory();
}

function renderHistory() {
  let visible = history.search(historyEntries, historyQuery);

  /* Typing a bookwork code should surface that entry first. */
  const compact = historyQuery.trim().toLowerCase().replace(/\s+/g, "");
  if (compact) {
    visible = [...visible].sort((a, b) => {
      const aExact = a.identifier?.toLowerCase().replace(/\s+/g, "") === compact ? 1 : 0;
      const bExact = b.identifier?.toLowerCase().replace(/\s+/g, "") === compact ? 1 : 0;
      return bExact - aExact;
    });
  }

  const showSection = settings.saveHistory || historyEntries.length > 0;

  dom.historySection.hidden = !showSection;
  if (!showSection) return;

  dom.btnClearHistory.hidden = historyEntries.length === 0;
  dom.historyEmpty.hidden = visible.length > 0;

  const frag = document.createDocumentFragment();
  for (const entry of visible.slice(0, 30)) {
    frag.append(historyItem(entry));
  }
  dom.historyList.replaceChildren(frag);
}

function historyItem(entry) {
  const row = el("div", { class: "history-row" });
  if (entry.identifier && settings.showIdentifier) {
    row.append(el("span", { class: "chip", text: entry.identifier }));
  }
  row.append(el("span", { class: "history-q", text: entry.question || "(no question text)" }));
  if (entry.answer) {
    row.append(el("span", { class: "history-a", text: entry.answer }));
  }

  const meta = el("div", { class: "history-meta" });
  if (entry.site) meta.append(el("span", { text: entry.site }));
  meta.append(el("span", { text: fmtTime(entry.timestampMs) }));

  return el("li", { class: "history-item", "data-id": entry.id },
    el("button", {
      class: "history-open",
      type: "button",
      title: "Open this result"
    }, row, meta),
    el("button", {
      class: "icon-btn history-copy",
      type: "button",
      title: "Copy answer",
      "aria-label": "Copy answer",
      html: icons.copy,
      disabled: !entry.answer
    }),
    el("button", {
      class: "icon-btn history-delete",
      type: "button",
      title: "Delete this entry",
      "aria-label": "Delete from history",
      html: icons.x
    })
  );
}

/* ================================
   SITE DETECTION
================================ */

async function toggleSiteDetection() {
  const tab = await engine.getActiveTab();
  let origin, hostname;
  try {
    const url = new URL(tab.url);
    origin = url.origin;
    hostname = url.hostname;
  } catch {
    showSiteStatus("Open the site's tab, then try again.");
    return;
  }

  const enabled = settings.enabledSites.some((s) => s.origin === origin);

  try {
    if (enabled) {
      await chrome.permissions.remove({ origins: [origin + "/*"] });
      await chrome.runtime.sendMessage({ type: "site:disable", origin, hostname });
      showSiteStatus(`Detection off for ${hostname}.`);
    } else {
      const granted = await chrome.permissions.request({ origins: [origin + "/*"] });
      if (!granted) {
        showSiteStatus(`Permission denied — detection needs access to ${hostname}.`);
        return;
      }
      await chrome.runtime.sendMessage({
        type: "site:enable",
        origin,
        hostname,
        tabId: tab.id
      });
      showSiteStatus(`Watching ${hostname} for new questions.`);
    }
    settings = await getSettings();
    refreshSiteToggle();
  } catch (err) {
    showSiteStatus(friendlyError(err));
  }
}

function refreshSiteToggle() {
  const site = settings.enabledSites[settings.enabledSites.length - 1];
  const enabled = !!site;
  dom.btnSiteToggle.textContent = enabled
    ? `Stop watching ${site.hostname}`
    : "Enable detection for the current site";
  dom.siteToggleLabel.textContent = enabled ? "Enabled sites" : "This site";
}

function showSiteStatus(message) {
  dom.siteStatus.textContent = message;
}

/* ================================
   SETTINGS
================================ */

function wireSettings() {
  dom.btnSettings.addEventListener("click", () => {
    dom.btnSettings.setAttribute(
      "aria-expanded",
      String(!dom.settingsPanel.open)
    );
  });

  /* theme */
  dom.themeSelect.value = settings.theme;
  dom.themeSelect.addEventListener("change", async () => {
    settings = await setSettings({ theme: dom.themeSelect.value });
    applyTheme(settings.theme);
  });

  /* include working + history saving */
  dom.includeWorkingToggle.checked = settings.includeWorking;
  dom.includeWorkingToggle.addEventListener("change", async () => {
    settings = await setSettings({ includeWorking: dom.includeWorkingToggle.checked });
  });

  dom.saveHistoryToggle.checked = settings.saveHistory;
  dom.saveHistoryToggle.addEventListener("change", async () => {
    settings = await setSettings({ saveHistory: dom.saveHistoryToggle.checked });
    renderHistory();
  });

  /* detection */
  dom.autoDetectToggle.checked = settings.autoDetect;
  dom.autoDetectToggle.addEventListener("change", async () => {
    settings = await setSettings({ autoDetect: dom.autoDetectToggle.checked });
  });

  dom.autoAnalyzeToggle.checked = settings.autoAnalyze;
  dom.autoAnalyzeToggle.addEventListener("change", async () => {
    settings = await setSettings({ autoAnalyze: dom.autoAnalyzeToggle.checked });
  });

  dom.showIdentifierToggle.checked = settings.showIdentifier;
  dom.showIdentifierToggle.addEventListener("change", async () => {
    settings = await setSettings({ showIdentifier: dom.showIdentifierToggle.checked });
    renderHistory();
  });

  dom.btnSiteToggle.addEventListener("click", toggleSiteDetection);
  refreshSiteToggle();

  /* diagnostics */
  refreshPopupDiag();
  dom.btnDiagRefresh.addEventListener("click", async () => {
    dom.btnDiagRefresh.disabled = true;
    try {
      await chrome.runtime.sendMessage({ type: "diag:check" });
      await refreshPopupDiag();
    } finally {
      dom.btnDiagRefresh.disabled = false;
    }
  });
  dom.btnDiagCopy.addEventListener("click", async (ev) => {
    const report = await buildDiagReport();
    copyAnswer(report, ev.currentTarget);
  });

  onSettingsChanged((next) => {
    settings = next;
    dom.includeWorkingToggle.checked = next.includeWorking;
    dom.saveHistoryToggle.checked = next.saveHistory;
    dom.autoDetectToggle.checked = next.autoDetect;
    dom.autoAnalyzeToggle.checked = next.autoAnalyze;
    dom.showIdentifierToggle.checked = next.showIdentifier;
    if (dom.themeSelect.value !== next.theme) {
      dom.themeSelect.value = next.theme;
      applyTheme(next.theme);
    }
    renderHistory();
    renderStatus(null);
  });
}
