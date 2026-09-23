/*
 * Provider registry. Sparxer ships with exactly one provider: Chrome's
 * built-in AI (local Gemini Nano) — no keys, no network, no accounts.
 *
 * The provider contract (see chrome-local.js) is deliberate: a future
 * cloud provider is one file that exports the same shape plus a registry
 * line here. Nothing else in the codebase needs to change.
 */

import { chromeLocal } from "./chrome-local.js";

const PROVIDERS = { "chrome-local": chromeLocal };

export function getProvider(id) {
  return PROVIDERS[id] || chromeLocal;
}

/* The built-in provider is always "configured" — there is no key. */
export function isConfigured(_settings, _providerId) {
  return true;
}

export function listProviders() {
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    label: p.label,
    capabilities: p.capabilities,
    requiresApiKey: false,
    models: p.models
  }));
}
