/*
 * Ollama provider — local models via the official OpenAI-compatible API
 * (http://localhost:11434/v1). No key, ever; the user runs Ollama
 * themselves, so nothing leaves their machine.
 */

import { buildPrompt } from "../core/prompt.js";
import { chatAnalyze } from "./openai-compat.js";
import { ProviderError, ERROR_KINDS } from "../core/errors.js";

const CHAT_URL = "http://localhost:11434/v1/chat/completions";
const TAGS_URL = "http://localhost:11434/api/tags";

export const ollama = {
  id: "ollama",
  label: "Ollama (local)",
  capabilities: { vision: true },
  requiresApiKey: false,
  allowCustomModel: true,
  hostPermission: {
    origins: ["http://localhost/*", "http://127.0.0.1/*"],
    label: "Ollama on this computer"
  },
  defaultModel: "llama3.2-vision",
  models: [
    { id: "llama3.2-vision", label: "Llama 3.2 Vision" },
    { id: "qwen2.5vl:7b", label: "Qwen2.5 VL 7B" }
  ],

  async testConnection() {
    try {
      const response = await fetch(TAGS_URL);
      if (!response.ok) return { ok: false, message: `Ollama answered with ${response.status}.` };
      const data = await response.json();
      const count = Array.isArray(data.models) ? data.models.length : 0;
      return {
        ok: true,
        message: count
          ? `Connected — ${count} model${count === 1 ? "" : "s"} available`
          : "Connected, but no models installed — run `ollama pull llama3.2-vision`"
      };
    } catch {
      return { ok: false, message: "Ollama isn't running at localhost:11434." };
    }
  },

  async analyze(input, opts) {
    try {
      return await chatAnalyze(
        {
          url: CHAT_URL,
          headers: { "Content-Type": "application/json" },
          model: opts.model || this.defaultModel,
          buildPrompt
        },
        { ...input, ...opts }
      );
    } catch (err) {
      /* Connection refused is the common case — make it obvious. */
      if (err?.name === "TypeError") {
        throw new ProviderError(
          ERROR_KINDS.NETWORK,
          "Can't reach Ollama at localhost:11434 — is it running?"
        );
      }
      throw err;
    }
  }
};
