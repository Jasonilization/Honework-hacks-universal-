/*
 * Shared OpenAI-compatible chat-completions client.
 * NVIDIA NIM, Ollama and OpenRouter all speak this dialect; each provider
 * file supplies endpoint, headers and defaults.
 */

import { parseModelJSON } from "../core/parse.js";
import { normalizeResult } from "../core/result.js";
import {
  ProviderError,
  ERROR_KINDS,
  httpErrorKind,
  statusMessage
} from "../core/errors.js";

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export async function chatAnalyze(
  { url, headers, model, buildPrompt },
  { questionText, identifier, imageBase64, mimeType = "image/jpeg", includeWorking = true, signal }
) {
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

      const response = await fetch(url, {
        method: "POST",
        headers,
        signal,
        body: JSON.stringify({
          model,
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
        throw new ProviderError(ERROR_KINDS.PARSE, "Provider returned an empty response.");
      }

      return normalizeResult(parseModelJSON(text), { model });
    } catch (err) {
      if (signal?.aborted) throw err;
      if (
        err instanceof ProviderError &&
        err.kind !== ERROR_KINDS.SERVER &&
        err.kind !== ERROR_KINDS.RATE_LIMIT
      ) {
        throw err;
      }
      lastError = err;
    }
  }

  throw lastError || new ProviderError(ERROR_KINDS.UNKNOWN, "Request failed.");
}

export async function pingChat({ url, headers, model }) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }]
    })
  });
  if (response.ok) return { ok: true, message: "Connected" };
  return { ok: false, message: await errorMessage(response) };
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
