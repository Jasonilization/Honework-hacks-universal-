/*
 * Analysis engine, popup-side client.
 * The work happens in the background service worker; this module talks to
 * it and mirrors the worker's state to the UI over a long-lived port.
 */

let port = null;
const listeners = new Set();

function emit(message) {
  /* Listeners receive the state object, not the envelope. */
  if (message?.type === "state") {
    for (const listener of listeners) listener(message.state);
  }
}

function connect() {
  if (port) return;
  port = chrome.runtime.connect({ name: "app" });
  port.onMessage.addListener(emit);
  port.onDisconnect.addListener(() => {
    port = null;
    /* The worker may have idled out — reattach on the next call. */
  });
}

/* Subscribe to worker state. The worker pushes the current state on
 * connect, so the callback always receives an initial snapshot. */
export function onState(callback) {
  listeners.add(callback);
  connect();
}

/* ---------------- actions ---------------- */

export async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

export async function analyzePage() {
  const tab = await getActiveTab();
  let site = "";
  try {
    site = new URL(tab.url).hostname;
  } catch {
    /* restricted page — fine */
  }
  const response = await chrome.runtime.sendMessage({
    type: "analyze:page",
    tabId: tab?.id,
    site
  });
  if (response?.ok === false) throw new Error(response.error || "Could not start analysis.");
}

export async function retry() {
  const response = await chrome.runtime.sendMessage({ type: "analyze:retry" });
  if (response?.ok === false) throw new Error(response.error || "Nothing to retry.");
}

export async function cancel() {
  await chrome.runtime.sendMessage({ type: "cancel" });
}

export async function analyzeDetected(question) {
  const response = await chrome.runtime.sendMessage({
    type: "analyze:question",
    question,
    hash: question?.hash
  });
  if (response?.ok === false) throw new Error(response.error || "Could not start analysis.");
}
