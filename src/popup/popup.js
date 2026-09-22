/*
 * Sparxer — popup controller.
 * Owns nothing but presentation: the analysis runs in the background
 * service worker (engine.js is the client), persistence lives in
 * src/storage and providers in src/providers.
 */

import { get as getSettings, set as setSettings, onChanged as onSettingsChanged } from "../storage/settings.js";
import * as history from "../storage/history.js";
import { listProviders, getProvider } from "../providers/registry.js";
import { friendlyError, ERROR_KINDS } from "../core/errors.js";
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
  btnCancel: $("btnCancel"),
  providerSelect: $("providerSelect"),
  modelSelect: $("modelSelect"),
  customModelWrap: $("customModelWrap"),
  customModelInput: $("customModelInput"),
  apiKeyInput: $("apiKeyInput"),
  btnEye: $("btnEye"),
  btnTest: $("btnTest"),
  testStatus: $("testStatus"),
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
  footVersion: $("footVersion")
};

let settings = null;
let historyEntries = [];
let historyQuery = "";

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

  engine.onState(renderState);
  loadHistory();
}

/* ================================
   WORKER STATE -> UI
================================ */

function renderState(state) {
  renderStatus(state);
  renderDetected(state);

  if (state.analyzing) {
    renderLoading(state.analyzing.label);
  } else if (state.error) {
    renderError(state.error.message);
  } else if (state.lastResult) {
    renderResult(state.lastResult);
  } else {
    clearCard();
  }
}

/* ================================
   ACTIONS
================================ */

function wireActions() {
  dom.btnAnalyze.addEventListener("click", () => run(engine.analyzeScreen));
  dom.btnCancel.addEventListener("click", () => engine.cancel().catch(() => {}));

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
  const hasKey = !!settings[settings.provider]?.apiKey;
  const workerError = state?.error && !state?.analyzing;

  const value = state?.analyzing
    ? "analyzing"
    : workerError
      ? "error"
      : hasKey
        ? "ready"
        : "warn";

  dom.status.dataset.state = value;
  dom.statusText.textContent =
    value === "analyzing"
      ? "Analyzing…"
      : value === "error"
        ? "Error"
        : value === "ready"
          ? "Ready"
          : "API key needed";

  dom.btnCancel.hidden = !state?.analyzing;
  dom.btnAnalyze.disabled = !!state?.analyzing;
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

function renderLoading(label) {
  clearCard();
  dom.resultCard.hidden = false;
  dom.resultCard.append(
    el("div", { class: "loading-status" },
      el("span", { class: "spinner", "aria-hidden": "true" }),
      el("span", { id: "loadingLabel", text: label ? `Waiting for ${label}…` : "Analyzing…" })
    ),
    el("div", { class: "skeleton" }),
    el("div", { class: "skeleton", style: "width: 60%" }),
    el("div", { class: "skeleton", style: "width: 40%" })
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
  context.append(el("span", { class: "context-site", text: result.site || "Screen capture" }));
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
  meta.append(el("span", { class: "badge-model", text: result.model || result.provider }));
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
  try {
    await navigator.clipboard.writeText(text);
    const original = button.innerHTML;
    button.innerHTML = icons.check + " Copied";
    setTimeout(() => {
      button.innerHTML = original;
    }, 1200);
  } catch {
    dom.testStatus.textContent = "Copy failed.";
  }
}

function timeShort(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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
  if (entry.model) meta.append(el("span", { text: entry.model }));
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
  dom.siteToggleLabel.textContent = enabled
    ? "Enabled sites"
    : "This site";
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

  /* provider */
  const providers = listProviders();
  for (const p of providers) {
    dom.providerSelect.append(el("option", { value: p.id, text: p.label }));
  }
  dom.providerSelect.value = settings.provider;
  dom.providerSelect.addEventListener("change", () => switchProvider(dom.providerSelect.value));

  /* model + key reflect the active provider */
  populateModels();
  loadProviderFields();

  dom.modelSelect.addEventListener("change", () => {
    if (dom.modelSelect.value === "__custom") return;
    saveProvider({ model: dom.modelSelect.value });
  });

  dom.customModelInput.addEventListener("change", () => {
    const value = dom.customModelInput.value.trim();
    if (value) saveProvider({ model: value });
  });

  /* api key */
  let saveTimer = null;
  dom.apiKeyInput.addEventListener("input", () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveProvider({ apiKey: dom.apiKeyInput.value.trim() }), 500);
  });

  dom.btnEye.addEventListener("click", () => {
    const hidden = dom.apiKeyInput.type === "password";
    dom.apiKeyInput.type = hidden ? "text" : "password";
    dom.btnEye.setAttribute("aria-label", hidden ? "Hide API key" : "Show API key");
  });

  dom.btnTest.addEventListener("click", testConnection);

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

  onSettingsChanged((next) => {
    settings = next;
    dom.includeWorkingToggle.checked = next.includeWorking;
    dom.saveHistoryToggle.checked = next.saveHistory;
    if (dom.themeSelect.value !== next.theme) {
      dom.themeSelect.value = next.theme;
      applyTheme(next.theme);
    }
    renderHistory();
    renderStatus(null);
  });
}

function currentProviderSettings() {
  return settings[settings.provider] || { apiKey: "", model: "" };
}

async function saveProvider(patch) {
  const providerId = settings.provider;
  settings = await setSettings({
    [providerId]: { ...currentProviderSettings(), ...patch }
  });
  renderStatus(null);
}

function populateModels() {
  const provider = getProvider(settings.provider);
  const current = currentProviderSettings().model || provider.defaultModel;

  dom.modelSelect.replaceChildren();
  for (const m of provider.models) {
    dom.modelSelect.append(el("option", { value: m.id, text: m.label }));
  }

  if (provider.allowCustomModel) {
    if (!provider.models.some((m) => m.id === current)) {
      dom.modelSelect.append(el("option", { value: "__custom", text: "Custom model" }));
    }
    dom.modelSelect.value = provider.models.some((m) => m.id === current) ? current : "__custom";
    dom.customModelWrap.hidden = false;
    dom.customModelInput.value = provider.models.some((m) => m.id === current) ? "" : current;
  } else {
    dom.modelSelect.value = provider.models.some((m) => m.id === current)
      ? current
      : provider.defaultModel;
    dom.customModelWrap.hidden = true;
  }
}

function loadProviderFields() {
  const ps = currentProviderSettings();
  dom.apiKeyInput.value = ps.apiKey || "";
  dom.apiKeyInput.type = "password";
}

async function switchProvider(providerId) {
  if (providerId === "openrouter") {
    /* OpenRouter talks to a host that isn't in the base manifest —
     * request it here, from the user's own click. */
    const granted = await chrome.permissions.request({
      origins: ["https://openrouter.ai/*"]
    });
    if (!granted) {
      dom.providerSelect.value = settings.provider;
      showTestStatus(false, "Permission denied — OpenRouter needs network access.");
      return;
    }
  }
  settings = await setSettings({ provider: providerId });
  populateModels();
  loadProviderFields();
  renderStatus(null);
}

async function testConnection() {
  const ps = currentProviderSettings();
  if (!ps.apiKey) {
    showTestStatus(false, "Enter an API key first.");
    return;
  }

  dom.btnTest.disabled = true;
  showTestStatus(null, "Testing…");

  try {
    const provider = getProvider(settings.provider);
    const outcome = await provider.testConnection(ps);
    showTestStatus(outcome.ok, outcome.message);
  } catch (err) {
    showTestStatus(false, friendlyError(err));
  } finally {
    dom.btnTest.disabled = false;
  }
}

function showTestStatus(ok, message) {
  dom.testStatus.textContent = message || "";
  if (ok === null) dom.testStatus.removeAttribute("data-ok");
  else dom.testStatus.dataset.ok = String(ok);
}
