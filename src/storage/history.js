/*
 * Question history — chrome.storage.local, capped ring, recent-first.
 * Entries never contain screenshots or URLs with query strings.
 */

const KEY = "history";
const MAX_ENTRIES = 200;

/*
 * Entry shape:
 * {
 *   id, hash, question, identifier, answer, steps[], hint, note,
 *   model, provider, site, timestampMs
 * }
 */

export async function list() {
  const data = await chrome.storage.local.get(KEY);
  const entries = data[KEY];
  return Array.isArray(entries) ? entries : [];
}

export async function add(entry) {
  const entries = await list();

  const filtered = entry.hash
    ? entries.filter((e) => e.hash !== entry.hash)
    : entries.filter((e) => e.id !== entry.id);

  const next = [entry, ...filtered].slice(0, MAX_ENTRIES);
  await chrome.storage.local.set({ [KEY]: next });
  return entry;
}

export function search(entries, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) =>
    [e.question, e.answer, e.identifier, e.model, e.site]
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
}

export async function remove(id) {
  const entries = await list();
  await chrome.storage.local.set({ [KEY]: entries.filter((e) => e.id !== id) });
}

export async function clear() {
  await chrome.storage.local.set({ [KEY]: [] });
}

export async function findByHash(hash) {
  if (!hash) return null;
  const entries = await list();
  return entries.find((e) => e.hash === hash) || null;
}

export function onChanged(listener) {
  const wrapped = (changes, area) => {
    if (area === "local" && changes[KEY]) listener(changes[KEY].newValue || []);
  };
  chrome.storage.onChanged.addListener(wrapped);
  return () => chrome.storage.onChanged.removeListener(wrapped);
}

export function newId() {
  return crypto.randomUUID();
}
