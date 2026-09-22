/*
 * Sparx AI — popup controller.
 * Owns nothing but presentation: analysis goes through engine.js,
 * persistence through src/storage, providers through src/providers.
 */

import { get as getSettings, set as setSettings, onChanged as onSettingsChanged } from "../storage/settings.js";
import { listProviders, getProvider } from "../providers/registry.js";
import { friendlyError, ERROR_KINDS } from "../core/errors.js";
import { applyTheme, watchSystem } from "./theme.js";
import { icons, el, fmtDuration } from "./ui.js";
import * as engine from "./engine.js";

const $ = (id) => document.getElementById(id);

const dom = {
  status: $("status"),
  statusText: $("statusText"),
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
  footVersion: $("footVersion")
};

let settings = null;
let analyzing = false;
let lastAction = null; /* "screen" — regenerate support */

/* ================================
   INIT
================================ */

init();

async function init() {
  settings = await getSettings();

  applyTheme(settings.theme);
  watchSystem(() => applyTheme(settings.theme));
  onSettingsChanged((next) => {
    settings = next;
    applyTheme(settings.theme);
  });

  dom.footVersion.textContent = "v" + chrome.runtime.getManifest().version;

  wireActions();
  wireSettings();

  renderStatus();
}

/* ================================
   ACTIONS
================================ */

function wireActions() {
  dom.btnAnalyze.addEventListener("click", () => runAnalysis("screen"));
  dom.btnCancel.addEventListener("click", () => engine.cancel());
}

async function runAnalysis(action) {
  if (analyzing) return;
  clearCard();
  analyzing = true;
  lastAction = action;
  renderStatus();
  renderLoading("Capturing screen…");

  try {
    const result = await engine.analyzeScreen((phase) => {
      if (phase === "analyzing") {
        const label = getProvider(settings.provider).label;
        renderLoading(`Waiting for ${label}…`);
      }
    });

    analyzing = false;
    lastResult = result;
    renderStatus();
    renderResult(result);
  } catch (err) {
    analyzing = false;
    renderStatus(err);
    if (err?.kind === ERROR_KINDS.CANCELLED || err?.name === "AbortError") {
      clearCard();
    } else {
      renderError(friendlyError(err));
    }
  }
}

let lastResult = null;

/* ================================
   STATUS
================================ */

function renderStatus(error = null) {
  const state = analyzing
    ? "analyzing"
    : error
      ? "error"
      : settings[settings.provider]?.apiKey
        ? "ready"
        : "warn";

  dom.status.dataset.state = state;
  dom.statusText.textContent = analyzing
    ? "Analyzing…"
    : error
      ? "Error"
      : state === "ready"
        ? "Ready"
        : "API key needed";

  dom.btnCancel.hidden = !analyzing;
  dom.btnAnalyze.disabled = analyzing;
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
      el("span", { id: "loadingLabel", text: label })
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
      onclick: () => runAnalysis(lastAction || "screen")
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
      onclick: () => runAnalysis(lastAction || "screen")
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

  /* include working */
  dom.includeWorkingToggle.checked = settings.includeWorking;
  dom.includeWorkingToggle.addEventListener("change", async () => {
    settings = await setSettings({ includeWorking: dom.includeWorkingToggle.checked });
  });

  onSettingsChanged((next) => {
    settings = next;
    dom.includeWorkingToggle.checked = next.includeWorking;
    if (dom.themeSelect.value !== next.theme) {
      dom.themeSelect.value = next.theme;
      applyTheme(next.theme);
    }
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
  renderStatus();
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
  renderStatus();
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
