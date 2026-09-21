/*
 * Canonical result shape used by providers, the background worker, storage
 * and every UI surface:
 *
 * { question, identifier, answer, steps[], hint, note, model }
 *
 * The background worker adds: provider, timestampMs, durationMs, source.
 */

import { ProviderError, ERROR_KINDS } from "./errors.js";

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeResult(raw, meta = {}) {
  const data = raw || {};

  const steps = Array.isArray(data.steps)
    ? data.steps
        .map((s) => asString(s))
        .filter(Boolean)
        .slice(0, 12)
    : [];

  const result = {
    question: asString(data.question),
    identifier: asString(data.identifier).toUpperCase(),
    answer: asString(data.answer),
    steps,
    hint: asString(data.hint),
    note: asString(data.note) || asString(data.reason),
    model: meta.model || ""
  };

  if (!result.answer && !result.note) {
    throw new ProviderError(
      ERROR_KINDS.PARSE,
      "The model didn't return an answer. Try again or switch models."
    );
  }

  return result;
}
