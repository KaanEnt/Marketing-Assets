import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const TEMPLATE_IDS = [
  "corporate-photo-panel",
  "rounded-mask-offset",
  "bold-flat-arc",
  "elegant-circle-rings",
] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];

export type Template = {
  id: TemplateId;
  label: string;
  /** When this skeleton is the right choice. Written for the model, not for a UI. */
  use: string;
  /** The structural moves that define it, so the model can vary without losing the shape. */
  techniques: string[];
};

export const TEMPLATES: Record<TemplateId, Template> = {
  "corporate-photo-panel": {
    id: "corporate-photo-panel",
    label: "Corporate photo panel",
    use: "Established, trustworthy, information-dense. Insurance, finance, legal, healthcare, professional services. Best when there is a service list and a full contact block to carry.",
    techniques: [
      "full-bleed tinted background wash",
      "thin repeating vertical line pattern as a texture band",
      "translucent white accent rectangles scattered at low opacity",
      "large rectangular masked photo panel that text overlaps",
      "eyebrow line above a two-line heavy headline",
      "bulleted service list in the left column",
      "two-column contact block anchored to the bottom margin",
    ],
  },
  "rounded-mask-offset": {
    id: "rounded-mask-offset",
    label: "Rounded mask with offset outline",
    use: "Modern, confident, minimal. Automotive, trades, B2B services, anything that benefits from restraint and negative space. Best when the copy is short.",
    techniques: [
      "generous negative space on a near-white ground",
      "photo masked into a large rounded corner shape bleeding off two edges",
      "a second offset outlined copy of that shape sitting behind it",
      "solid color panel with its own offset outline holding the key message",
      "oversized headline anchored to the bottom left",
      "stacked contact lines under the headline",
    ],
  },
  "bold-flat-arc": {
    id: "bold-flat-arc",
    label: "Bold flat with arc mask",
    use: "Energetic, consumer-facing, high contrast. Travel, retail, events, promotions, anything youthful. Best when a hero illustration carries the message.",
    techniques: [
      "saturated full-bleed color field",
      "photo clipped into a large sweeping arc from a corner",
      "diagonal stripe halftone discs as corner accents",
      "heavy three-line headline in reversed white",
      "a dedicated illustration slot across the middle band",
      "compact brand block with URL in the lower left",
    ],
  },
  "elegant-circle-rings": {
    id: "elegant-circle-rings",
    label: "Elegant circles and rings",
    use: "Refined, editorial, considered. Consultancies, wellness, real estate, corporate reports. Best when there is real body copy to lay out.",
    techniques: [
      "light neutral ground with two circular masked photos on opposing corners",
      "concentric arc rings framing each circle at decreasing stroke weight",
      "grayscale filter on photography so the accent color stays dominant",
      "accent-colored headline set left, three lines",
      "two-column body: mission paragraph over a bulleted list",
      "icon-led contact rows using data-icon glyphs",
    ],
  },
};

const cache = new Map<TemplateId, string>();

/** Raw SVG source. Read from disk so the files stay openable in a real SVG editor. */
export function templateSvg(id: TemplateId): string {
  const cached = cache.get(id);
  if (cached) return cached;

  const svg = readFileSync(join(process.cwd(), "lib", "templates", `${id}.svg`), "utf8");
  cache.set(id, svg);
  return svg;
}

export function isTemplateId(id: string): id is TemplateId {
  return (TEMPLATE_IDS as readonly string[]).includes(id);
}

/** Catalog shown to the model so it can choose a skeleton before composing. */
export function templateCatalog(): string {
  return TEMPLATE_IDS.map((id) => {
    const template = TEMPLATES[id];
    return [
      `### ${template.id}`,
      template.use,
      ...template.techniques.map((technique) => `- ${technique}`),
    ].join("\n");
  }).join("\n\n");
}
