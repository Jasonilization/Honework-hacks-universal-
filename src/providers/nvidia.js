/*
 * NVIDIA NIM provider — official API (https://build.nvidia.com).
 * Free signup for an nvapi- key; OpenAI-compatible endpoints.
 */

import { buildPrompt } from "../core/prompt.js";
import { chatAnalyze, pingChat } from "./openai-compat.js";
import { ProviderError, ERROR_KINDS } from "../core/errors.js";

const API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

export const nvidia = {
  id: "nvidia",
  label: "NVIDIA NIM",
  capabilities: { vision: true },
  requiresApiKey: true,
  allowCustomModel: true,
  hostPermission: { origins: ["https://integrate.api.nvidia.com/*"] },
  defaultModel: "meta/llama-3.2-90b-vision-instruct",
  models: [
    { id: "meta/llama-3.2-90b-vision-instruct", label: "Llama 3.2 90B Vision" },
    { id: "meta/llama-3.2-11b-vision-instruct", label: "Llama 3.2 11B Vision" },
    { id: "nvidia/llama-3.1-nemotron-70b-instruct", label: "Nemotron 70B (text only)" }
  ],

  async testConnection({ apiKey }) {
    if (!apiKey) return { ok: false, message: "Enter an NVIDIA key (free at build.nvidia.com)." };
    const outcome = await pingChat({
      url: API_URL,
      headers: authHeaders(apiKey),
      model: this.models[2].id
    });
    return outcome;
  },

  async analyze(input, opts) {
    if (!opts.apiKey) {
      throw new ProviderError(ERROR_KINDS.AUTH, "Add your NVIDIA key in Settings (free at build.nvidia.com).");
    }
    return chatAnalyze(
      {
        url: API_URL,
        headers: authHeaders(opts.apiKey),
        model: opts.model || this.defaultModel,
        buildPrompt
      },
      { ...input, ...opts }
    );
  }
};

function authHeaders(apiKey) {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`
  };
}
