/*
 * Sparx AI — popup (canonical implementation).
 *
 * This file was previously duplicated: two full copies of the logic were
 * pasted on top of each other, ending in a syntax error (orphan "});")
 * that stopped the extension from loading at all. This is the single,
 * de-duplicated implementation, with the fixes kept from both copies:
 *   - key sent via x-goog-api-key header (not a URL query parameter)
 *   - model-fallback list with a single retry policy
 *   - markdown-fence stripping when parsing the model response
 *   - request cancellation via AbortController
 */

const apiKeyBox = document.getElementById("apiKey");
const saveKey = document.getElementById("saveKey");
const scan = document.getElementById("scan");

const loading = document.getElementById("loading");
const loadingModel = document.getElementById("loadingModel");

const result = document.getElementById("result");
const error = document.getElementById("error");

const questionEl = document.getElementById("question");
const answerEl = document.getElementById("answer");
const stepsEl = document.getElementById("steps");
const hintEl = document.getElementById("hint");

const copy = document.getElementById("copy");

const dot = document.getElementById("dot");
const statusText = document.getElementById("statusText");

/* Verified against https://ai.google.dev/gemini-api/docs/models */
const DEFAULT_MODEL = "gemini-3.6-flash";
const FALLBACK_MODELS = [
  DEFAULT_MODEL,
  "gemini-flash-latest",
  "gemini-2.5-flash-lite"
];

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

let currentAbort = null;

/* ================================
   API KEY
================================ */

chrome.storage.local.get("geminiKey", (data) => {
  if (data.geminiKey) {
    apiKeyBox.value = data.geminiKey;
    setReady();
  }
});

saveKey.addEventListener("click", async () => {
  clearError();

  const key = apiKeyBox.value.trim();
  if (!key) {
    showError("Enter your Gemini API key.");
    return;
  }

  try {
    await chrome.storage.local.set({ geminiKey: key });
    setReady();
    showMessage("API key saved.");
  } catch (err) {
    showError("Could not save key: " + err.message);
  }
});

/* ================================
   SCAN SCREEN
================================ */

scan.addEventListener("click", async () => {
  clearError();
  result.classList.add("hidden");

  if (scan.disabled) return;

  const data = await chrome.storage.local.get("geminiKey");
  const key = data.geminiKey;
  if (!key) {
    showError("Save your Gemini API key first.");
    return;
  }

  const abort = new AbortController();
  currentAbort = abort;

  scan.disabled = true;
  loading.classList.remove("hidden");
  const startTime = performance.now();

  try {
    setStatus("CAPTURING");
    loadingModel.textContent = "SCREENSHOT...";

    const screenshot = await chrome.tabs.captureVisibleTab(null, {
      format: "jpeg",
      /* Small text must stay readable for the model. */
      quality: 85
    });

    if (!screenshot) throw new Error("Screenshot failed.");

    setStatus("ANALYZING");

    const resultData = await askGemini(key, screenshot, abort.signal);
    displayResult(resultData);

    const elapsed = Math.round(performance.now() - startTime);
    setStatus("DONE " + elapsed + "ms");
  } catch (err) {
    if (abort.signal.aborted) {
      setStatus("CANCELLED");
    } else {
      console.error("Sparx AI:", err);
      showError(err.message || "Unknown error.");
      setStatus("ERROR");
    }
  } finally {
    currentAbort = null;
    loading.classList.add("hidden");
    scan.disabled = false;
  }
});

/* ================================
   GEMINI REQUEST (single policy)
================================ */

async function askGemini(key, screenshot, signal) {
  const comma = screenshot.indexOf(",");
  if (comma === -1) throw new Error("Invalid screenshot.");
  const base64 = screenshot.substring(comma + 1);

  const prompt = `
You are a fast educational mathematics tutor.

Read the supplied screenshot carefully.
Find the visible mathematics question.
Solve it accurately.

Return ONLY valid JSON:

{
  "question": "question",
  "answer": "final answer",
  "steps": [
    "step 1",
    "step 2"
  ],
  "hint": "short hint"
}

Rules:
- Do not guess unreadable text.
- Check the mathematics.
- Keep the answer concise.
- Use only JSON.
`;

  let lastError = null;

  for (let i = 0; i < FALLBACK_MODELS.length; i++) {
    const model = FALLBACK_MODELS[i];
    loadingModel.textContent = "MODEL: " + model;

    /* One retry per model for rate limits / transient server errors,
     * then move on to the next model. */
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) await sleep(800);

        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/" +
            model +
            ":generateContent",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              /* The key belongs in a header, never in the URL. */
              "x-goog-api-key": key
            },
            signal,
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: prompt },
                    {
                      inline_data: {
                        mime_type: "image/jpeg",
                        data: base64
                      }
                    }
                  ]
                }
              ],
              generationConfig: {
                temperature: 0.1,
                responseMimeType: "application/json"
              }
            })
          }
        );

        const raw = await response.text();

        if (!response.ok) {
          let message = "HTTP " + response.status;
          try {
            message = JSON.parse(raw)?.error?.message || message;
          } catch {
            /* keep generic message */
          }

          lastError = new Error(
            "Gemini " + response.status + ": " + message
          );

          /* Unknown model — fall through to the next one immediately. */
          if (response.status === 404) break;

          if (RETRYABLE.has(response.status)) continue;

          throw lastError;
        }

        let data;
        try {
          data = JSON.parse(raw);
        } catch {
          throw new Error("Gemini returned invalid data.");
        }

        const parts = data?.candidates?.[0]?.content?.parts;
        if (!Array.isArray(parts)) {
          throw new Error("Gemini returned no content.");
        }

        const text = parts.map((p) => p?.text || "").join("").trim();
        if (!text) throw new Error("Gemini returned an empty answer.");

        return parseGeminiJSON(text);
      } catch (err) {
        if (signal?.aborted) throw err;
        lastError = err;
        console.warn(model + " attempt failed:", err);
      }
    }
  }

  throw lastError || new Error("All Gemini models failed.");
}

/* ================================
   JSON PARSER (with fence stripping)
================================ */

function parseGeminiJSON(text) {
  let cleaned = text.trim();

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

    throw new Error("Gemini returned invalid JSON.");
  }
}

/* ================================
   DISPLAY
================================ */

function displayResult(data) {
  questionEl.textContent = data?.question || "Question not detected.";
  answerEl.textContent = data?.answer || "No answer returned.";

  if (Array.isArray(data?.steps) && data.steps.length) {
    stepsEl.textContent = data.steps
      .map((step, index) => index + 1 + ". " + step)
      .join("\n");
  } else {
    stepsEl.textContent = "No working returned.";
  }

  hintEl.textContent = data?.hint || "No hint returned.";
  result.classList.remove("hidden");
}

/* ================================
   COPY
================================ */

copy.addEventListener("click", async () => {
  const text = answerEl.textContent.trim();
  if (!text || text === "No answer returned.") return;

  try {
    await navigator.clipboard.writeText(text);
    copy.textContent = "[ COPIED ]";
    setTimeout(() => {
      copy.textContent = "[ COPY ANSWER ]";
    }, 1000);
  } catch {
    showError("Copy failed.");
  }
});

/* ================================
   UI HELPERS
================================ */

function setReady() {
  dot.style.background = "#00ff88";
  statusText.textContent = "READY";
}

function setStatus(text) {
  statusText.textContent = text;
}

function showError(message) {
  error.textContent = message;
  error.style.color = "#ff5555";
  error.style.borderColor = "#ff3333";
  error.classList.remove("hidden");
}

function showMessage(message) {
  error.textContent = message;
  error.style.color = "#00ff88";
  error.style.borderColor = "#00ff88";
  error.classList.remove("hidden");
}

function clearError() {
  error.classList.add("hidden");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
