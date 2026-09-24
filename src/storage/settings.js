/*
 * Settings storage — chrome.storage.local, one "settings" key, defaults
 * merged on read. Sparxer v5.2 runs on Chrome's built-in AI only, so
 * there are no provider credentials to store.
 */

const KEY = "settings";

export const DEFAULTS = {
  theme: "system",          /* "system" | "light" | "dark" */
  gemini: { apiKey: "", model: "gemini-3.6-flash" },  /* cloud fallback */
  includeWorking: true,
  autoDetect: true,         /* master switch for all question detection */
  autoAnalyze: false,
  showIdentifier: true,
  saveHistory: true,
  enabledSites: []           /* [{ origin, hostname }] — detection opt-in */
};

export async function get() {
  const data = await chrome.storage.local.get(KEY);
  const stored = data[KEY] || {};
  const settings = { ...DEFAULTS, ...stored };

  if (!Array.isArray(settings.enabledSites)) settings.enabledSites = [];

  return settings;
}

export async function set(patch) {
  const settings = await get();
  const next = { ...settings, ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export function onChanged(listener) {
  const wrapped = (changes, area) => {
    if (area === "local" && changes[KEY]) listener(changes[KEY].newValue);
  };
  chrome.storage.onChanged.addListener(wrapped);
  return () => chrome.storage.onChanged.removeListener(wrapped);
}
