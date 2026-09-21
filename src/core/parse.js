/*
 * Parse a model reply that is supposed to be a JSON object.
 * Strips markdown fences and, as a last resort, extracts the outermost
 * {...} block before giving up.
 */

import { ProviderError, ERROR_KINDS } from "./errors.js";

export function parseModelJSON(text) {
  let cleaned = String(text || "").trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");

    if (first !== -1 && last > first) {
      try {
        return JSON.parse(cleaned.substring(first, last + 1));
      } catch {
        /* fall through */
      }
    }

    throw new ProviderError(
      ERROR_KINDS.PARSE,
      "The model's response couldn't be parsed. Try again or switch models."
    );
  }
}
