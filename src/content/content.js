/*
 * Sparxer — content script bootstrap.
 *
 * Registered dynamically (chrome.scripting.registerContentScripts) only on
 * origins the user has explicitly enabled. It stays completely dormant
 * unless detection is on for that site. This file is deliberately a
 * classic script: it can't be type=module, so it loads the real detector
 * via dynamic import (the imported modules are web-accessible).
 */

(async function () {
  if (window.__sparxerDetector) return;
  window.__sparxerDetector = true;

  try {
    const detector = await import(chrome.runtime.getURL("src/content/detector.js"));
    detector.start();
  } catch (err) {
    console.warn("[Sparxer] detector failed to start:", err);
  }
})();
