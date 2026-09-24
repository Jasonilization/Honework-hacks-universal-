/*
 * Chrome built-in AI provider — the Prompt API (LanguageModel, local
 * Gemini Nano). No key, no network, no cost: the model runs inside
 * Chrome itself. Text-only, so it answers detected questions (the
 * DOM-detected text) rather than screenshots. Feature-detected at
 * runtime; every failure path carries a specific, reportable message.
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

  /* "readily" | "after-download" | "downloading" | "unavailable" */
  async availability() {
    if (!("LanguageModel" in globalThis)) return "unavailable";
    /* Newer builds warn unless a language is declared. */
    const hint = {
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }]
    };
    try {
      return await LanguageModel.availability(hint);
    } catch {
      /* Older shapes may reject the hint — plain call. */
      try {
        return await LanguageModel.availability();
      } catch {
        return "unavailable";
      }
    }
  },

  /* Human-readable status for the diagnostics panel. */
  async status() {
    const state = await this.availability();
    const notes = {
      readily: "Model ready — runs offline",
      "after-download": "Model not downloaded yet (~2 GB). The next analyze fetches it; that can take several minutes.",
      downloading: "Model currently downloading. Try again once it finishes.",
      unavailable: "LanguageModel API missing. Update Chrome (or enable chrome://flags/#prompt-api-for-extensions), then reload the extension."
    };
    return { state, note: notes[state] || "Unknown state: " + state };
  },

  async testConnection() {
    const { state, note } = await this.status();
    return { ok: state === "readily", message: note };
  },

  async analyze(
    { imageBase64, questionText, identifier },
    { includeWorking = true, signal, onProgress } = {}
  ) {
    if (imageBase64 && !questionText) {
      throw new ProviderError(
        ERROR_KINDS.REQUEST,
        "The built-in model can't read screenshots — questions come from the page text."
      );
    }

    if (!questionText) {
      throw new ProviderError(
        ERROR_KINDS.REQUEST,
        "No question text was found on the page."
      );
    }

    if (!("LanguageModel" in globalThis)) {
      throw new ProviderError(
        ERROR_KINDS.REQUEST,
        "Diagnostics: LanguageModel is not defined in this context. " +
        "Update Chrome, then reload the extension."
      );
    }

    const state = await this.availability();

    if (state === "unavailable") {
      throw new ProviderError(
        ERROR_KINDS.REQUEST,
        "Built-in AI unavailable here. " +
        "(Diagnostics: LanguageModel exists but availability() failed or returned unavailable.)"
      );
    }
    if (state === "downloading") {
      throw new ProviderError(
        ERROR_KINDS.REQUEST,
        "Still downloading the model — try again once Chrome finishes."
      );
    }

    /* "after-download": create() kicks off the download. Attach a monitor
     * when this Chrome supports it so the UI can show real progress. */

    const createOpts = {
      initialPrompts: [{ role: "system", content: SYSTEM_PROMPT }],
      temperature: 0.1
    };

    let monitor = null;
    if (onProgress && typeof LanguageModel.createMonitor === "function") {
      try {
        monitor = LanguageModel.createMonitor();
        monitor.addEventListener("downloadprogress", (event) => {
          onProgress(Math.min(1, event.loaded ?? 0));
        });
        createOpts.monitor = monitor;
      } catch {
        /* monitor unsupported — the download just takes longer silently */
      }
    }

    let session;
    try {
      session = await LanguageModel.create(createOpts);
    } catch (err) {
      throw new ProviderError(
        ERROR_KINDS.REQUEST,
        "Couldn't start the built-in model: " + (err?.message || err) +
          (state === "after-download"
            ? " (a one-time ~2 GB download may still be running — check Chrome's downloads)"
            : "")
      );
    }

    onProgress?.(1);

    try {
      const prompt = buildPrompt({ questionText, identifier, includeWorking });
      const text = await promptWithSignal(session, prompt, signal);
      if (!text) {
        throw new ProviderError(ERROR_KINDS.PARSE, "Built-in model returned an empty response.");
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
    try {
      return await session.prompt(prompt);
    } catch (retryErr) {
      /* Surface the real failure instead of a generic blob. */
      throw new ProviderError(
        ERROR_KINDS.PARSE,
        "Built-in model failed to answer: " + (retryErr?.message || String(retryErr))
      );
    }
  }
}
