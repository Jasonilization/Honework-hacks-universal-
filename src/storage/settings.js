/*
 * Settings storage — chrome.storage.local, one "settings" key, defaults
 * merged on read, plus a one-time migration from the legacy "geminiKey".
 */

const KEY = "settings";

export const DEFAULTS = {
  provider: "gemini",
  theme: "system",          /* "system" | "light" | "dark" */
  includeWorking: true,
  screenshotQuality: 85,
  autoDetect: true,         /* master switch for all question detection */
  autoAnalyze: false,
  showIdentifier: true,
  saveHistory: true,
  enabledSites: [],         /* [{ origin, hostname }] — detection opt-in */
  gemini: { apiKey: "", model: "gemini-3.6-flash" },
  openrouter: { apiKey: "", model: "google/gemini-2.5-flash" },
  nvidia: { apiKey: "", model: "meta/llama-3.2-90b-vision-instruct" },
  ollama: { model: "llama3.2-vision" },
  "chrome-local": {}
};

let migrated = false;

export async function get() {
  const data = await chrome.storage.local.get([KEY, "geminiKey"]);
  const stored = data[KEY] || {};

  const settings = { ...DEFAULTS, ...stored };

  /* merge every provider's sub-object so new providers get defaults */
  for (const key of Object.keys(DEFAULTS)) {
    if (DEFAULTS[key] && typeof DEFAULTS[key] === "object" && !Array.isArray(DEFAULTS[key])) {
      settings[key] = { ...DEFAULTS[key], ...(stored[key] || {}) };
    }
  }

  if (!Array.isArray(settings.enabledSites)) settings.enabledSites = [];

  /* Legacy: v4 stored the key at the top level. */
  if (!migrated && data.geminiKey && !settings.gemini.apiKey) {
    settings.gemini.apiKey = data.geminiKey;
    await chrome.storage.local.set({ [KEY]: settings, geminiKey: null });
    migrated = true;
  }

  return settings;
}

export async function set(patch) {
  const settings = await get();
  const next = { ...settings, ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export function providerSettings(settings, providerId) {
  return settings[providerId] || DEFAULTS[providerId];
}

export function onChanged(listener) {
  const wrapped = (changes, area) => {
    if (area === "local" && changes[KEY]) listener(changes[KEY].newValue);
  };
  chrome.storage.onChanged.addListener(wrapped);
  return () => chrome.storage.onChanged.removeListener(wrapped);
}
