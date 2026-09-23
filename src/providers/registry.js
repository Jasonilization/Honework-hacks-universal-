/*
 * Provider registry — the UI and the background worker only ever talk to
 * this interface, so new providers (official APIs only) slot in here.
 *
 * Keyless providers (requiresApiKey: false) are "always available":
 * Chrome's built-in AI and a local Ollama. Vision-capable ones can read
 * screenshots; text-only ones work with DOM-detected questions.
 */

import { gemini } from "./gemini.js";
import { openrouter } from "./openrouter.js";
import { nvidia } from "./nvidia.js";
import { ollama } from "./ollama.js";
import { chromeLocal } from "./chrome-local.js";

const PROVIDERS = {
  gemini,
  openrouter,
  nvidia,
  ollama,
  "chrome-local": chromeLocal
};

export function getProvider(id) {
  return PROVIDERS[id] || PROVIDERS.gemini;
}

/* True when a provider is usable right now (has a key if it needs one). */
export function isConfigured(settings, providerId) {
  const provider = getProvider(providerId);
  if (!provider.requiresApiKey) return true;
  return !!settings[providerId]?.apiKey;
}

export function listProviders() {
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    label: p.label,
    capabilities: p.capabilities,
    requiresApiKey: p.requiresApiKey === false ? false : true,
    allowCustomModel: !!p.allowCustomModel,
    hostPermission: p.hostPermission || null,
    defaultModel: p.defaultModel,
    models: p.models
  }));
}
