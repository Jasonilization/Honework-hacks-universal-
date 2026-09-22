/*
 * Theme handling: setting is "system" | "light" | "dark" (persisted in
 * settings); the resolved value lands on <html data-theme="..."> and the
 * stylesheet does the rest via CSS custom properties.
 */

const media = window.matchMedia("(prefers-color-scheme: dark)");

export function resolveTheme(preference) {
  if (preference === "light" || preference === "dark") return preference;
  return media.matches ? "dark" : "light";
}

export function applyTheme(preference) {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
}

export function watchSystem(callback) {
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
