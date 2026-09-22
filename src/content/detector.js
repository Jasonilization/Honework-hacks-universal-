/*
 * Sparxer — question detector.
 *
 * Pipeline: MutationObserver (scoped by the site adapter) -> DOM settles
 * -> debounce (500 ms) -> extract via adapter -> normalize + hash ->
 * dedupe against the last question -> report to the service worker.
 *
 * No polling, no timers while idle, no document-wide scans beyond the
 * adapter's own container. Everything switches off when detection is
 * disabled for the site or globally (live, via storage change events).
 */

import { questionFingerprint } from "../core/normalize.js";
import { pickAdapter } from "../sites/index.js";

const DEBOUNCE_MS = 500;

let observer = null;
let debounceTimer = null;
let active = false;
let adapter = null;
let lastHash = null;

export function start() {
  chrome.storage.onChanged.addListener(onStorageChanged);
  chrome.storage.local.get("settings").then(({ settings }) => {
    applySettings(settings);
  });
  window.addEventListener("popstate", onNavigation);
}

function onStorageChanged(changes, area) {
  if (area === "local" && changes.settings) {
    applySettings(changes.settings.newValue);
  }
}

function onNavigation() {
  if (active) schedule();
}

function isEnabled(settings) {
  if (!settings?.autoDetect) return false;
  return (settings.enabledSites || []).some(
    (site) => site.origin === location.origin
  );
}

function applySettings(settings) {
  if (isEnabled(settings)) {
    if (!active) startObserving();
  } else if (active) {
    stopObserving();
  }
}

function startObserving() {
  active = true;
  adapter = pickAdapter(location.hostname);

  const container = adapter.detectPage() || document.body;
  observer = new MutationObserver(schedule);
  observer.observe(container, {
    childList: true,
    subtree: true,
    characterData: true
  });

  check(); /* catch a question that is already on screen */
}

function stopObserving() {
  active = false;
  lastHash = null;
  if (observer) observer.disconnect();
  observer = null;
  clearTimeout(debounceTimer);
}

function schedule() {
  if (!active) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(check, DEBOUNCE_MS);
}

function check() {
  if (!active) return;

  let detected;
  try {
    detected = adapter.detectQuestion();
  } catch {
    return; /* page mutated mid-extraction; the observer will reschedule */
  }

  if (!detected || !detected.text) return;

  const { hash } = questionFingerprint(detected.text);
  if (hash === lastHash) return;
  lastHash = hash;

  try {
    chrome.runtime.sendMessage({
      type: "question:detected",
      question: {
        text: detected.text,
        identifier: detected.identifier || "",
        site: location.hostname,
        origin: location.origin
      },
      hash
    }).catch(() => {});
  } catch {
    /* extension context gone */
  }
}
