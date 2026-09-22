/*
 * Adapter registry: specific platforms first, generic fallback last.
 * Adding a site later means adding one file here — nothing else changes.
 */

import { sparxAdapter } from "./sparx.js";
import { genericAdapter } from "./generic.js";

const ADAPTERS = [sparxAdapter];

export function pickAdapter(hostname) {
  return ADAPTERS.find((a) => a.matches(hostname)) || genericAdapter;
}

export { genericAdapter, sparxAdapter };
