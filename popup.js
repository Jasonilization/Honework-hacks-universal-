/*
 * Sparx AI — popup (module rewrite).
 * UI logic only: providers, parsing and storage live in src/.
 * The screen-capture flow still runs here until the background
 * service worker lands (next commit).
 */

import { get as getSettings, set as setSettings } from "./src/storage/settings.js";
import { getProvider } from "./src/providers/registry.js";
import { friendlyError } from "./src/core/errors.js";

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

let currentAbort = null;

/* ================================
   INIT
================================ */

init();

async function init() {
  const settings = await getSettings();
  if (settings.gemini.apiKey) {
    apiKeyBox.value = settings.gemini.apiKey;
    setReady();
  }
}

/* ================================
   API KEY
================================ */

saveKey.addEventListener("click", async () => {
  clearError();

  const key = apiKeyBox.value.trim();
  if (!key) {
    showError("Enter your Gemini API key.");
    return;
  }

  try {
    await setSettings({ gemini: { apiKey: key, model: "gemini-3.6-flash" } });
    setReady();
    showMessage("API key saved.");
  } catch (err) {
    showError("Could not save key: " + friendlyError(err));
  }
});

/* ================================
   SCAN SCREEN
================================ */

scan.addEventListener("click", async () => {
  clearError();
  result.classList.add("hidden");

  if (scan.disabled) return;

  const settings = await getSettings();
  const key = settings.gemini.apiKey;
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
      quality: settings.screenshotQuality
    });
    if (!screenshot) throw new Error("Screenshot failed.");

    setStatus("ANALYZING");
    loadingModel.textContent = "MODEL: " + settings.gemini.model;

    const comma = screenshot.indexOf(",");
    const provider = getProvider("gemini");

    const data = await provider.analyze(
      { imageBase64: screenshot.substring(comma + 1), mimeType: "image/jpeg" },
      {
        apiKey: key,
        model: settings.gemini.model,
        includeWorking: settings.includeWorking,
        signal: abort.signal
      }
    );

    displayResult(data);
    setStatus("DONE " + Math.round(performance.now() - startTime) + "ms");
  } catch (err) {
    if (abort.signal.aborted) {
      setStatus("CANCELLED");
    } else {
      console.error("Sparx AI:", err);
      showError(friendlyError(err));
      setStatus("ERROR");
    }
  } finally {
    currentAbort = null;
    loading.classList.add("hidden");
    scan.disabled = false;
  }
});

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
