import type { Issue } from "@/lib/layout/autocorrect";
import type { Preset } from "@/lib/layout/presets";

/**
 * The brief handed to the model when the deterministic pass gave up.
 *
 * It is deliberately narrow. The solver has already placed everything it could
 * place correctly, so asking for a fresh design would throw that away and risk a
 * worse result than the one on screen. What is left over is the class of problem
 * arithmetic cannot touch: copy that needs re-breaking for a different column
 * width, a hierarchy that only works in portrait, type that has no legible size in
 * a short frame. Those need judgement, so those are the only things asked for.
 */
export function refineMessage(preset: Preset, issues: Issue[]): string {
  const unresolved = issues.filter((issue) => !issue.fixed);

  const lines = [
    `Rework this design for ${preset.label} (${preset.width} x ${preset.height}).`,
    "",
    "It was adapted automatically from another format. The layout solver placed every",
    "layer and fixed what it could, but these problems need a designer's judgement:",
    "",
    ...unresolved.map((issue) => `- ${issue.message}`),
    "",
    "Keep the same layer ids, palette, typefaces and structural idea. This is the same",
    "design in a new format, not a new design. Fix the problems by re-breaking copy",
    "across lines, resizing type into this format's own scale, and rebalancing the",
    "composition to use the space this shape actually has.",
  ];

  if (preset.note) lines.push("", `Remember: ${preset.note}`);

  return lines.join("\n");
}

/** One-line summary for the card, e.g. "2 issues need a rework". */
export function issueSummary(issues: Issue[]): string {
  const unresolved = issues.filter((issue) => !issue.fixed).length;
  const fixed = issues.length - unresolved;

  if (unresolved > 0) {
    return `${unresolved} issue${unresolved === 1 ? "" : "s"} left`;
  }
  if (fixed > 0) {
    return `${fixed} fix${fixed === 1 ? "" : "es"} applied`;
  }
  return "Clean";
}
