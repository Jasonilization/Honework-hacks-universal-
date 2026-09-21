/*
 * Google Gemini provider — official Generative Language API.
 * Model IDs verified against https://ai.google.dev/gemini-api/docs/models
 */

import { buildPrompt } from "../core/prompt.js";
import { parseModelJSON } from "../core/parse.js";
import { normalizeResult } from "../core/result.js";
import {
  ProviderError,
  ERROR_KINDS,
  httpErrorKind,
  statusMessage
} from "../core/errors.js";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export const gemini = {
  id: "gemini",
  label: "Google Gemini",
  capabilities: { vision: true },
  defaultModel: "gemini-3.6-flash",
  models: [
    { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
    { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" },
    { id: "gemini-3.7-flash", label: "Gemini 3.7 Flash" },
    { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
    { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" }
  ],
  /* Tried in order when the selected model 404s or keeps failing. */
  fallbackModels: ["gemini-flash-latest", "gemini-2.5-flash-lite"],

  async testConnection({ apiKey }) {
    const started = performance.now();
    const response = await fetch(`${API_BASE}/models`, {
      headers: { "x-goog-api-key": apiKey }
    });
    const latencyMs = Math.round(performance.now() - started);

    if (response.ok) {
      return { ok: true, latencyMs, message: `Connected (${latencyMs} ms)` };
    }

    const message = await errorMessage(response);
    return { ok: false, message };
  },

  async analyze(
    { imageBase64, mimeType = "image/jpeg", questionText, identifier },
    { apiKey, model, includeWorking = true, signal }
  ) {
    if (!apiKey) {
      throw new ProviderError(ERROR_KINDS.AUTH, "Add your Gemini API key in Settings.");
    }

    const prompt = buildPrompt({ questionText, identifier, includeWorking });
    const parts = [{ text: prompt }];
    if (imageBase64) {
      parts.push({ inline_data: { mime_type: mimeType, data: imageBase64 } });
    }

    const chain = [model || this.defaultModel, ...this.fallbackModels]
      .filter((m, i, arr) => m && arr.indexOf(m) === i);

    let lastError = null;

    for (const candidate of chain) {
      /* One retry per model for rate limits / transient server errors. */
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (attempt > 0) await sleep(800);

          const response = await fetch(
            `${API_BASE}/models/${candidate}:generateContent`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": apiKey
              },
              signal,
              body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: {
                  temperature: 0.1,
                  responseMimeType: "application/json"
                }
              })
            }
          );

          if (!response.ok) {
            const message = await errorMessage(response);

            if (response.status === 404) {
              lastError = new ProviderError(ERROR_KINDS.REQUEST, message);
              break; /* next model in the chain */
            }

            lastError = new ProviderError(
              httpErrorKind(response.status),
              message
            );

            if (RETRYABLE.has(response.status)) continue;
            throw lastError;
          }

          const data = await response.json();
          const reply = data?.candidates?.[0]?.content?.parts;
          if (!Array.isArray(reply)) {
            throw new ProviderError(
              ERROR_KINDS.PARSE,
              "Gemini returned no content. The question may not have been visible."
            );
          }

          const text = reply.map((p) => p?.text || "").join("").trim();
          if (!text) {
            throw new ProviderError(
              ERROR_KINDS.PARSE,
              "Gemini returned an empty response."
            );
          }

          return normalizeResult(parseModelJSON(text), { model: candidate });
        } catch (err) {
          if (signal?.aborted) throw err;
          if (err instanceof ProviderError && !RETRYABLE_KINDS.has(err.kind)) throw err;
          lastError = err;
        }
      }
    }

    throw lastError || new ProviderError(ERROR_KINDS.UNKNOWN, "All Gemini models failed.");
  }
};

const RETRYABLE_KINDS = new Set([ERROR_KINDS.RATE_LIMIT, ERROR_KINDS.SERVER]);

async function errorMessage(response) {
  try {
    const json = await response.json();
    return statusMessage(response.status, json?.error?.message?.slice(0, 140));
  } catch {
    return statusMessage(response.status);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
