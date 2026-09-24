/*
 * Provider registry.
 *
 * Engine selection happens at runtime in the worker: Chrome's built-in AI
 * is preferred (no key, offline); when the on-device model isn't actually
 * usable on this machine, Gemini (official API, free key) takes over —
 * only if a key has been saved.
 */

import { chromeLocal } from "./chrome-local.js";
import { gemini } from "./gemini.js";

const PROVIDERS = { "chrome-local": chromeLocal, gemini };

export function getProvider(id) {
  return PROVIDERS[id] || chromeLocal;
}

export function listProviders() {
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    label: p.label,
    requiresApiKey: p.requiresApiKey === false ? false : true
  }));
}

/* Pick the engine for this run.
 * Returns { provider, engine, engineSettings }. */
export async function pickEngine(settings) {
  const local = PROVIDERS["chrome-local"];
  const localState = await local.availability();

  if (localState === "readily") {
    return { provider: local, engine: "builtin", engineSettings: {} };
  }

  /* Built-in downloading: use it as soon as it's done, but don't block
   * today's homework — cloud wins if a key exists. */
  if (settings.gemini?.apiKey) {
    return {
      provider: PROVIDERS.gemini,
      engine: "cloud",
      engineSettings: settings.gemini,
      localState
    };
  }

  /* Nothing else available — explain precisely. */
  const reason =
    localState === "downloading"
      ? "Chrome's on-device model is still downloading. Add a free Gemini key in Settings → Cloud fallback to solve questions meanwhile."
      : localState === "after-download"
        ? "Chrome's on-device model needs a one-time download (~2 GB) that hasn't happened yet. Add a free Gemini key in Settings → Cloud fallback, or run one analyze to start the download."
        : "This Chrome can't run the on-device model (service not available). Add a free Gemini key in Settings → Cloud fallback — it takes a minute and stays in this browser.";

  const error = new Error(reason);
  error.kind = "engine";
  error.localState = localState;
  throw error;
}

export async function isConfigured(settings, _providerId) {
  const localState = await PROVIDERS["chrome-local"].availability();
  return localState === "readily" || !!settings.gemini?.apiKey;
}
