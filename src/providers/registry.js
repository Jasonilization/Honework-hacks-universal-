/*
 * Provider registry — the UI and the background worker only ever talk to
 * this interface, so new providers (official APIs only) slot in here.
 */

import { gemini } from "./gemini.js";
import { openrouter } from "./openrouter.js";

const PROVIDERS = { gemini, openrouter };

export function getProvider(id) {
  return PROVIDERS[id] || PROVIDERS.gemini;
}

export function listProviders() {
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    label: p.label,
    capabilities: p.capabilities,
    defaultModel: p.defaultModel,
    allowCustomModel: !!p.allowCustomModel,
    models: p.models
  }));
}
