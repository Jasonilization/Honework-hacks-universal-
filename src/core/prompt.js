/*
 * Prompt construction shared by every provider, so answer quality and the
 * JSON contract stay identical regardless of the backend.
 */

export const RESULT_SCHEMA = `{
  "question": "the question, exactly as asked",
  "identifier": "the site's code for this question, e.g. 4A, or \\"\\" if none is visible",
  "answer": "final answer only",
  "steps": ["step 1", "step 2"],
  "hint": "one short hint in case the student is stuck",
  "note": "short note if something is wrong (e.g. no question visible), otherwise \\"\\""
}`;

export function buildPrompt({ questionText, identifier, includeWorking } = {}) {
  const lines = [
    "You are a precise school-maths tutor. Homework platforms show you one question at a time."
  ];

  if (identifier) {
    lines.push(`The site labels this question "${identifier}".`);
  }

  if (questionText) {
    lines.push(
      "The question text was extracted from the page:",
      "<question>",
      questionText.trim(),
      "</question>",
      "If a screenshot is also attached, use it for context (diagrams, layout)."
    );
  } else {
    lines.push("Read the maths question in the attached screenshot. Ignore menus, progress bars and navigation.");
  }

  lines.push(
    "Solve it accurately and return ONLY a valid JSON object with exactly these fields:",
    RESULT_SCHEMA,
    "",
    "Rules:",
    "- Check every calculation.",
    "- Give exact values (fractions, surds, π) rather than rounded decimals unless the question asks otherwise.",
    includeWorking
      ? "- Include 2 to 6 short, clear steps in \"steps\" appropriate for a school student."
      : "- Put a single very short sentence in \"steps\" — the student only wants the answer.",
    "- If no maths question is visible, return empty \"question\" and \"answer\" and explain in \"note\".",
    "- Prefer Unicode symbols (√ × ÷ ² ³ π ≤ ≥) so the answer can be copied as plain text.",
    "- JSON only. No markdown fences, no commentary."
  );

  return lines.join("\n");
}
