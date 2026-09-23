/*
 * Chrome built-in AI provider — the Prompt API (LanguageModel, local
 * Gemini Nano). No key, no network, no cost: the model runs inside
 * Chrome itself. Text-only, so it answers detected questions (the
 * DOM-detected text) rather than screenshots. Feature-detected at
 * runtime; if this Chrome build doesn't expose it, the provider says so
 * instead of failing silently.
 */

import { buildPrompt } from "../core/prompt.js";
import { parseModelJSON } from "../core/parse.js";
import { normalizeResult } from "../core/result.js";
import { ProviderError, ERROR_KINDS } from "../core/errors.js";

const SYSTEM_PROMPT =
  "You are a precise school-maths tutor. Always reply with exactly the JSON " +
  "object the user asks for — no markdown, no commentary.";

export const chromeLocal = {
  id: "chrome-local",
  label: "Chrome built-in AI",
  capabilities: { vision: false },
  requiresApiKey: false,
  allowCustomModel: false,
  models: [],
  defaultModel: "chrome-builtin",

  async availability() {
    if (!("LanguageModel" in globalThis)) return "unavailable";
    try {
      return await LanguageModel.availability();
    } catch {
      return "unavailable";
    }
  },

  async testConnection() {
    const state = await this.availability();
    switch (state) {
      case "readily":
        return { ok: true, message: "Ready — runs offline inside Chrome" };
      case "after-download":
        return { ok: false, message: "Model needs a one-time download (~2 GB) — start it by analyzing a question." };
      case "downloading":
        return { ok: false, message: "Model still downloading…" };
      default:
        return { ok: false, message: "Not available in this Chrome build." };
    }
  },

  async analyze(
    { imageBase64, questionText, identifier },
    { includeWorking = true, signal }
  ) {
    if (imageBase64 && !questionText) {
      throw new ProviderError(
        ERROR_KINDS.REQUEST,
        "The built-in model can't read screenshots. Enable detection on this site " +
        "(it works from the page text) or pick a vision-capable provider."
      );
    }

    const state = await this.availability();
    if (state === "unavailable") {
      throw new ProviderError(
        ERROR_KINDS.REQUEST,
        "Built-in AI isn't available in this Chrome build — pick another provider in Settings."
      );
    }
    if (state === "downloading") {
      throw new ProviderError(
        ERROR_KINDS.REQUEST,
        "The local model is still downloading. Wait for it to finish or pick another provider."
      );
    }

    /* "after-download": create() kicks off the download, first answer takes a while. */

    const session = await LanguageModel.create({
      initialPrompts: [{ role: "system", content: SYSTEM_PROMPT }],
      temperature: 0.1
    });

    try {
      const prompt = buildPrompt({ questionText, identifier, includeWorking });
      const text = await promptWithSignal(session, prompt, signal);
      if (!text) {
        throw new ProviderError(ERROR_KINDS.PARSE, "The built-in model returned an empty response.");
      }
      return normalizeResult(parseModelJSON(text), { model: "chrome-builtin" });
    } finally {
      session.destroy?.();
    }
  }
};

async function promptWithSignal(session, prompt, signal) {
  try {
    return await session.prompt(prompt, signal ? { signal } : undefined);
  } catch (err) {
    if (signal?.aborted) throw err;
    /* Older builds don't accept options — retry plainly. */
    return await session.prompt(prompt);
  }
}
