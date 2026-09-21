/*
 * OpenRouter provider — official API (https://openrouter.ai/docs).
 * One key unlocks many models; the user pays OpenRouter, not us.
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

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export const openrouter = {
  id: "openrouter",
  label: "OpenRouter",
  capabilities: { vision: true },
  defaultModel: "google/gemini-2.5-flash",
  /* The OpenRouter catalog changes often, so custom IDs are allowed. */
  allowCustomModel: true,
  models: [
    { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
    { id: "openai/gpt-4o-mini", label: "GPT-4o mini" }
  ],

  async testConnection({ apiKey }) {
    const started = performance.now();
    const response = await fetch(API_URL, {
      method: "POST",
      headers: authHeaders(apiKey),
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }]
      })
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
      throw new ProviderError(ERROR_KINDS.AUTH, "Add your OpenRouter API key in Settings.");
    }

    const content = [
      { type: "text", text: buildPrompt({ questionText, identifier, includeWorking }) }
    ];
    if (imageBase64) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${imageBase64}` }
      });
    }

    let lastError = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) await sleep(800);

        const response = await fetch(API_URL, {
          method: "POST",
          headers: authHeaders(apiKey),
          signal,
          body: JSON.stringify({
            model: model || this.defaultModel,
            messages: [{ role: "user", content }]
          })
        });

        if (!response.ok) {
          const message = await errorMessage(response);
          lastError = new ProviderError(httpErrorKind(response.status), message);
          if (RETRYABLE.has(response.status)) continue;
          throw lastError;
        }

        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content;
        if (!text) {
          throw new ProviderError(ERROR_KINDS.PARSE, "OpenRouter returned an empty response.");
        }

        return normalizeResult(parseModelJSON(text), { model: model || this.defaultModel });
      } catch (err) {
        if (signal?.aborted) throw err;
        if (err instanceof ProviderError && err.kind !== ERROR_KINDS.SERVER) throw err;
        lastError = err;
      }
    }

    throw lastError || new ProviderError(ERROR_KINDS.UNKNOWN, "OpenRouter request failed.");
  }
};

function authHeaders(apiKey) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  };
}

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
