/*
 * Question normalization + hashing, shared by the content-script detector
 * (dedupe) and the background worker (duplicate-request guard).
 */

export function normalizeQuestion(text) {
  return String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[`'"’‘“”]/g, "'")
    .replace(/[^a-z0-9+\-*/=^(){}.,:;<>\sπ√×÷±≤≥²³]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* djb2 — fast, dependency-free, good enough for dedupe. */
export function hashQuestion(normalized) {
  let h = 5381;
  for (let i = 0; i < normalized.length; i++) {
    h = ((h << 5) + h + normalized.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

export function questionFingerprint(text) {
  const normalized = normalizeQuestion(text);
  return { normalized, hash: hashQuestion(normalized) };
}

/*
 * Bookwork-style identifiers ("4A", "12B") are shown by some platforms next
 * to each question. Only accept them when anchored to a keyword so algebra
 * like "3A + 2B" is never mistaken for a code.
 */
const ID_PATTERNS = [
  /\b(?:bookwork(?:\s+code)?|question|code|q)\s*[:#.]?\s*(\d{1,2}[A-Z])\b/i
];

export function extractIdentifier(text) {
  const source = String(text || "");
  for (const pattern of ID_PATTERNS) {
    const match = source.match(pattern);
    if (match) return match[1].toUpperCase();
  }
  return "";
}
