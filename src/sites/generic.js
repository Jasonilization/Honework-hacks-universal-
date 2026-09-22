/*
 * Generic adapter — best-effort question detection on any site.
 * Tries explicit "question-like" selectors first, then falls back to the
 * longest paragraph inside the main content area.
 */

import { createAdapter } from "./adapter.js";
import { extractIdentifier, normalizeQuestion } from "../core/normalize.js";

const EXPLICIT_SELECTORS = [
  '[class*="question" i]',
  '[id*="question" i]',
  '[class*="prompt" i]',
  '[class*="exercise" i]',
  '[class*="task" i]',
  "fieldset legend"
];

const MIN_LENGTH = 8;
const MAX_LENGTH = 1200;

function visible(element) {
  if (element.closest('[aria-hidden="true"]')) return false;
  return !!(element.offsetParent || element.getClientRects().length);
}

function cleanText(element) {
  return (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
}

function isQuestionSized(text) {
  return text.length >= MIN_LENGTH && text.length <= MAX_LENGTH;
}

function findQuestionElement() {
  /* 1 — explicit selectors */
  for (const selector of EXPLICIT_SELECTORS) {
    for (const element of document.querySelectorAll(selector)) {
      if (!visible(element)) continue;
      if (isQuestionSized(cleanText(element))) return element;
    }
  }

  /* 2 — longest visible paragraph in the main content area */
  let best = null;
  let bestLength = 0;
  for (const element of document.querySelectorAll("main p, body p")) {
    if (!visible(element)) continue;
    const text = cleanText(element);
    if (text.length > bestLength && isQuestionSized(text)) {
      best = element;
      bestLength = text.length;
    }
  }
  return best;
}

function identifierNear(element) {
  const scope = element.closest("section, form, main, [role=main]") || document.body;
  return extractIdentifier(scope.innerText || "");
}

export const genericAdapter = createAdapter({
  id: "generic",
  label: "Generic",

  matches: () => true,

  detectPage() {
    const element = findQuestionElement();
    if (!element) return null;
    return element.closest("form, section, main, [role=main]") || document.body;
  },

  detectQuestion() {
    const element = findQuestionElement();
    if (!element) return null;

    const text = cleanText(element);
    if (!isQuestionSized(text)) return null;

    return {
      text,
      identifier: extractIdentifier(text) || identifierNear(element)
    };
  },

  normalizeQuestion(text) {
    return normalizeQuestion(text);
  }
});
