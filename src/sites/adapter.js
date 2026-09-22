/*
 * Site adapter contract.
 *
 * A site adapter teaches the detector about one platform. It is a plain
 * object so content scripts can load it without a framework:
 *
 * {
 *   id: "sparx",
 *   label: "Sparx Maths",
 *   matches(hostname) -> boolean          // fast URL check
 *   detectPage() -> Element | null        // container to observe; null = body
 *   detectQuestion() -> { text, identifier? } | null
 * }
 *
 * Rules for implementations:
 * - Never submit anything to the site. Detection is read-only.
 * - Prefer site-specific containers over whole-document heuristics so the
 *   MutationObserver stays narrowly scoped.
 * - Identifiers (bookwork codes etc.) are metadata: return them when they
 *   are visible; never guess an identifier that isn't on the page.
 */

export function createAdapter(definition) {
  if (typeof definition.matches !== "function" ||
      typeof definition.detectQuestion !== "function") {
    throw new Error("Adapter is missing required methods.");
  }
  if (!definition.detectPage) definition.detectPage = () => null;
  return definition;
}
