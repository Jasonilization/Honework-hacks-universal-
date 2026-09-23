/*
 * One-shot page question extractor.
 *
 * Used when the user presses "Analyze question": the worker injects this
 * function into the active tab via chrome.scripting.executeScript, which
 * serializes the function body — so it must be completely self-contained
 * (no imports, no closure references). It mirrors the heuristics of
 * src/sites/generic.js; the duplication is the price of the serialization
 * constraint and both files say so.
 */

export function extractQuestionInPage() {
  const visible = (el) => {
    if (el.closest('[aria-hidden="true"]')) return false;
    return !!(el.offsetParent || el.getClientRects().length);
  };

  const clean = (el) =>
    (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();

  const sized = (t) => t.length >= 8 && t.length <= 1200;

  const EXPLICIT = [
    '[class*="question" i]',
    '[id*="question" i]',
    '[class*="prompt" i]',
    '[class*="exercise" i]',
    '[class*="task" i]',
    "fieldset legend"
  ];

  let el = null;

  outer: for (const selector of EXPLICIT) {
    for (const candidate of document.querySelectorAll(selector)) {
      if (visible(candidate) && sized(clean(candidate))) {
        el = candidate;
        break outer;
      }
    }
  }

  if (!el) {
    let bestLength = 0;
    for (const p of document.querySelectorAll("main p, body p")) {
      if (!visible(p)) continue;
      const text = clean(p);
      if (text.length > bestLength && sized(text)) {
        el = p;
        bestLength = text.length;
      }
    }
  }

  if (!el) return { text: "", identifier: "" };

  const text = clean(el);
  const scope =
    el.closest("section, form, main, [role=main]") || document.body;
  const scopeText = (scope.innerText || "") + "\n" + text;

  /* Bookwork-style identifiers — keyword-anchored so algebra never
   * masquerades as a code. */
  const bookwork = scopeText.match(
    /bookwork\s*(?:code)?\s*[:#]?\s*(\d{1,2}[A-Z])\b/i
  );
  const anchored = scopeText.match(
    /\b(?:bookwork(?:\s+code)?|question|code|q)\s*[:#.]?\s*(\d{1,2}[A-Z])\b/i
  );

  return {
    text,
    identifier: ((bookwork || anchored || [])[1] || "").toUpperCase()
  };
}
