export type FontRole = "display" | "body" | "mono";

export type FontFamily = {
  name: string;
  role: FontRole[];
  weights: number[];
  /** How it reads, so the model can pick on intent rather than by name. */
  voice: string;
};

// Self-hosted rather than CDN-linked: export fidelity depends on being able to
// base64-embed the exact subset into the SVG, which is impossible with a remote
// stylesheet. Keeping the list short also keeps the embedded payload small.
export const FONTS: FontFamily[] = [
  {
    name: "Inter",
    role: ["body"],
    weights: [400, 500, 600, 700],
    voice: "Neutral workhorse. Safe default for body and captions.",
  },
  {
    name: "Inter Tight",
    role: ["display"],
    weights: [500, 600, 700, 800],
    voice: "Tight grotesque. Strong headlines without shouting.",
  },
  {
    name: "Archivo",
    role: ["display", "body"],
    weights: [400, 600, 700, 800],
    voice: "Sturdy grotesque. Corporate and confident.",
  },
  {
    name: "Manrope",
    role: ["display", "body"],
    weights: [400, 500, 700, 800],
    voice: "Geometric and modern. Reads tech-forward.",
  },
  {
    name: "Poppins",
    role: ["display", "body"],
    weights: [400, 500, 600, 700],
    voice: "Round geometric. Friendly and approachable.",
  },
  {
    name: "Montserrat",
    role: ["display", "body"],
    weights: [400, 500, 600, 700, 800],
    voice: "Wide geometric. Classic small-business corporate.",
  },
  {
    name: "Roboto",
    role: ["body", "display"],
    weights: [400, 500, 700, 900],
    voice: "Ubiquitous neutral. Invisible, which is sometimes right.",
  },
  {
    name: "Oswald",
    role: ["display"],
    weights: [500, 600, 700],
    voice: "Condensed. Fits long headlines into narrow columns.",
  },
  {
    name: "Space Grotesk",
    role: ["display", "body"],
    weights: [400, 500, 600, 700],
    voice: "Quirky technical. Distinctive without being loud.",
  },
  {
    name: "DM Sans",
    role: ["display", "body"],
    weights: [400, 500, 700],
    voice: "Soft geometric. Calm and contemporary.",
  },
  {
    name: "Playfair Display",
    role: ["display"],
    weights: [400, 600, 700, 800],
    voice: "High-contrast serif. Luxury, editorial, premium.",
  },
  {
    name: "Source Serif 4",
    role: ["body"],
    weights: [400, 600, 700],
    voice: "Readable serif. Long-form body copy with authority.",
  },
  {
    name: "JetBrains Mono",
    role: ["mono"],
    weights: [400, 500, 700],
    voice: "Monospace. Data, codes, reference numbers.",
  },
];

export const FONT_NAMES = FONTS.map((font) => font.name);

// Pairings carry more of the design than the individual faces do, so the model
// picks a pair rather than two independent families.
export const FONT_PAIRINGS: { display: string; body: string; use: string }[] = [
  { display: "Inter Tight", body: "Inter", use: "Default. Clean, modern, never wrong." },
  { display: "Archivo", body: "Inter", use: "Corporate, insurance, finance, legal." },
  { display: "Montserrat", body: "Roboto", use: "Traditional small business, local services." },
  { display: "Manrope", body: "Inter", use: "Tech, SaaS, startups." },
  { display: "Poppins", body: "DM Sans", use: "Consumer, wellness, hospitality, friendly." },
  { display: "Oswald", body: "Roboto", use: "Events, sport, urgency, long headlines." },
  { display: "Playfair Display", body: "Source Serif 4", use: "Luxury, real estate, editorial." },
  { display: "Space Grotesk", body: "Inter", use: "Creative agencies, design-led brands." },
];

export function isAllowedFont(name: string): boolean {
  return FONT_NAMES.includes(name);
}

export function getFont(name: string): FontFamily | undefined {
  return FONTS.find((font) => font.name === name);
}

/** Nearest allowed weight, so a model asking for 750 gets 700 rather than a reject. */
export function nearestWeight(name: string, requested: number): number {
  const font = getFont(name);
  if (!font || font.weights.length === 0) return 400;

  return font.weights.reduce((best, weight) =>
    Math.abs(weight - requested) < Math.abs(best - requested) ? weight : best,
  );
}
