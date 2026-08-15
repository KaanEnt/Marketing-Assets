export type FontSpec = { family: string; weight: number };

export type Palette = {
  dominant: string;
  accent: string;
  neutrals: string[];
};

/**
 * Persisted per project and injected into every generation turn. This is what makes
 * the tenth asset better than the first: without it each prompt starts from nothing
 * and the flyer, the story and the banner come out as three unrelated designs.
 */
export type BrandKit = {
  palette?: Palette;
  fonts?: { display: FontSpec; body: FontSpec };
  /** Voice in a few words, e.g. "reassuring, established, plain-spoken". */
  tone?: string;
  /** Locked on the first generated illustration so later art matches it. */
  illustrationStyle?: string;
  /** The chosen logo concept, inlined so the model can place it as a lockup. */
  logoSvg?: string;
};

export function isBrandKitEmpty(kit?: BrandKit): boolean {
  if (!kit) return true;
  return !kit.palette && !kit.fonts && !kit.tone && !kit.logoSvg;
}

export function brandKitPrompt(kit?: BrandKit): string {
  if (isBrandKitEmpty(kit) || !kit) {
    return `## Brand kit

None set yet. Choose a palette and a font pairing that suit the brief, and state your
choices in one short line before the SVG so they can be locked in for later assets.`;
  }

  const lines: string[] = ["## Brand kit", "", "Use these exactly. Do not substitute."];

  if (kit.palette) {
    lines.push(
      "",
      `- Dominant: ${kit.palette.dominant}`,
      `- Accent: ${kit.palette.accent}`,
      `- Neutrals: ${kit.palette.neutrals.join(", ") || "none specified"}`,
    );
  }

  if (kit.fonts) {
    lines.push(
      "",
      `- Display font: ${kit.fonts.display.family} ${kit.fonts.display.weight}`,
      `- Body font: ${kit.fonts.body.family} ${kit.fonts.body.weight}`,
    );
  }

  if (kit.tone) lines.push("", `- Tone: ${kit.tone}`);

  if (kit.logoSvg) {
    lines.push(
      "",
      "The brand logo below is already designed. Place it as a lockup layer with id",
      '"logo-lockup". Reproduce its geometry as-is; you may scale and reposition it,',
      "but do not redraw it.",
      "",
      "```svg",
      kit.logoSvg.trim(),
      "```",
    );
  }

  return lines.join("\n");
}
