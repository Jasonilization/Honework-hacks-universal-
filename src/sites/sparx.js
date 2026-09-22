/*
 * Sparx Maths adapter — EXPERIMENTAL.
 *
 * The selector guesses below have not been verified against the live
 * site; everything falls back to the generic detector when they miss, so
 * enabling this is safe but may not be optimal until someone checks the
 * real DOM (the site requires a login, so it can't be verified offline).
 * Read-only by design: nothing here ever submits an answer.
 */

import { createAdapter } from "./adapter.js";
import { extractIdentifier } from "../core/normalize.js";
import { genericAdapter } from "./generic.js";

const CANDIDATE_SELECTORS = [
  '[data-testid*="question" i]',
  '[class*="question" i]',
  '[class*="bookwork" i]'
];

/* "Bookwork code: 4A" and friends — anchored, so algebra is never mistaken
 * for a code. */
const BOOKWORK_PATTERN = /bookwork\s*(?:code)?\s*[:#]?\s*(\d{1,2}[A-Z])\b/i;

function visible(element) {
  if (element.closest('[aria-hidden="true"]')) return false;
  return !!(element.offsetParent || element.getClientRects().length);
}

function cleanText(element) {
  return (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
}

function findSparxQuestion() {
  for (const selector of CANDIDATE_SELECTORS) {
    for (const element of document.querySelectorAll(selector)) {
      if (!visible(element)) continue;
      const text = cleanText(element);
      if (text.length >= 8 && text.length <= 1200) return element;
    }
  }
  return null;
}

export const sparxAdapter = createAdapter({
  id: "sparx",
  label: "Sparx Maths",

  matches(hostname) {
    return hostname === "sparxmaths.uk" || hostname.endsWith(".sparxmaths.uk");
  },

  detectPage() {
    const element = findSparxQuestion();
    if (element) return element.closest("form, section, main, [role=main]") || null;
    return genericAdapter.detectPage();
  },

  detectQuestion() {
    const element = findSparxQuestion();
    if (element) {
      const text = cleanText(element);
      const scope = element.closest("section, form, main, [role=main]") || document.body;
      const match = (scope.innerText || "").match(BOOKWORK_PATTERN);
      return {
        text,
        identifier: match ? match[1].toUpperCase() : extractIdentifier(text)
      };
    }
    return genericAdapter.detectQuestion();
  },

  normalizeQuestion(text) {
    return genericAdapter.normalizeQuestion(text);
  }
});
