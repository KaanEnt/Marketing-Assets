import type { PresetId } from "@/lib/layout/presets";

export const PLATFORMS = ["instagram", "youtube", "print"] as const;

export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  print: "Print",
};

export const TEMPLATE_IDS = [
  "ig-quote-card",
  "ig-carousel-cover",
  "ig-product-drop",
  "ig-story-announce",
  "yt-face-punch",
  "yt-big-number",
  "yt-split-compare",
  "corporate-photo-panel",
  "rounded-mask-offset",
  "bold-flat-arc",
  "elegant-circle-rings",
] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];

export type Template = {
  id: TemplateId;
  label: string;
  platform: Platform;
  /**
   * The format the skeleton is drawn at.
   *
   * Load-bearing, not descriptive. The contract requires the returned viewBox to
   * match the target preset exactly, so a skeleton drawn at another size would
   * make the model reflow it by hand, which is the one thing the constraint solver
   * exists to avoid. Picking a template therefore picks the format.
   */
  presetId: PresetId;
  /** One line for the gallery card. Written for a person. */
  blurb: string;
  /** When this skeleton is the right choice. Written for the model, not for a UI. */
  use: string;
  /** The structural moves that define it, so the model can vary without losing the shape. */
  techniques: string[];
};

export const TEMPLATES: Record<TemplateId, Template> = {
  "ig-quote-card": {
    id: "ig-quote-card",
    label: "Quote card",
    platform: "instagram",
    presetId: "ig-square",
    blurb: "A pull quote with attribution. Type carries the whole frame.",
    use: "A single statement, testimonial or customer quote. No photography. Best when the words are the asset and there is a person to credit.",
    techniques: [
      "flat dark ground with one accent hue and no photography",
      "geometric quotation ornament in the top left",
      "serif pull quote set left across three lines",
      "short accent rule above a two-line attribution",
      "brand line anchored bottom right",
      "full-width accent band along the bottom edge",
    ],
  },
  "ig-carousel-cover": {
    id: "ig-carousel-cover",
    label: "Carousel cover",
    platform: "instagram",
    presetId: "ig-portrait",
    blurb: "Hook headline over a photo band, with a slide count and swipe cue.",
    use: "The first slide of a multi-slide post. Best when the headline is a promise the rest of the carousel pays off, such as a numbered list or a guide.",
    techniques: [
      "light ground in the top half, photograph filling the bottom half",
      "photo masked into a rounded rectangle that bleeds off three edges",
      "dark vertical gradient scrim over the lower photo so reversed text stays legible",
      "slide-count pill anchored top right",
      "three-line hook headline set left at the top",
      "swipe cue with chevrons bottom left, handle bottom right",
    ],
  },
  "ig-product-drop": {
    id: "ig-product-drop",
    label: "Product drop",
    platform: "instagram",
    presetId: "ig-square",
    blurb: "One product, a price, a badge and a call to action.",
    use: "A single product, launch or offer. Best when there is one item to show, a price to state and one action to ask for.",
    techniques: [
      "warm neutral ground with the product photo masked into a large rounded rectangle",
      "circular offer badge overlapping the top right of the photo",
      "spaced-out wordmark top left",
      "two-line product name anchored to the bottom left",
      "price line with a struck-through original price",
      "solid pill call to action anchored bottom right",
    ],
  },
  "ig-story-announce": {
    id: "ig-story-announce",
    label: "Story announcement",
    platform: "instagram",
    presetId: "ig-story",
    blurb: "Centred launch message with a hero illustration, clear of the story UI.",
    use: "A launch, event or announcement in a vertical story. Best when there is a date, one message and one action. Everything is centred and held clear of the platform chrome.",
    techniques: [
      "full-bleed vertical gradient ground",
      "concentric accent rings framing a centred illustration slot",
      "spaced uppercase eyebrow above the headline",
      "three-line centred headline in the vertical middle",
      "supporting line under the headline",
      "solid pill call to action sitting above the bottom UI zone",
    ],
  },
  "yt-face-punch": {
    id: "yt-face-punch",
    label: "Reaction thumbnail",
    platform: "youtube",
    presetId: "yt-thumb",
    blurb: "Three huge words on the left, a cutout subject on the right.",
    use: "The default thumbnail shape. Best when the title is a short, blunt claim and there is a person to put next to it. Text must survive being seen at sidebar size.",
    techniques: [
      "near-black ground with a single high-visibility accent",
      "diagonal stripe disc flaring behind the subject",
      "cutout subject illustration anchored to the bottom right",
      "label pill in the top left corner",
      "three-line headline at roughly a fifth of the frame height, set left",
      "thick accent rule inset around the whole frame",
    ],
  },
  "yt-big-number": {
    id: "yt-big-number",
    label: "Numbered list thumbnail",
    platform: "youtube",
    presetId: "yt-thumb",
    blurb: "An oversized numeral beside two stacked lines, over a darkened photo.",
    use: "List and countdown videos. Best when the number is the hook, such as seven mistakes or three tools. The photo is atmosphere, not subject.",
    techniques: [
      "full-bleed photograph as the background layer",
      "horizontal gradient scrim darkening the left side for legibility",
      "spaced uppercase kicker naming the series",
      "oversized accent numeral anchored left",
      "two-line reversed headline set beside the numeral",
      "channel handle bottom left, clear of the duration badge",
    ],
  },
  "yt-split-compare": {
    id: "yt-split-compare",
    label: "Comparison thumbnail",
    platform: "youtube",
    presetId: "yt-thumb",
    blurb: "Two photos on a diagonal split with a versus badge between them.",
    use: "Before and after, this versus that, or any two-option comparison. Best when the two states read differently at a glance.",
    techniques: [
      "diagonal split dividing the frame into two photo panels",
      "accent-coloured diagonal bar along the seam",
      "circular versus badge centred on the seam",
      "dark banner across the top carrying the question",
      "one short reversed label per side, anchored to the bottom corners",
      "labels held clear of the duration badge zone",
    ],
  },
  "corporate-photo-panel": {
    id: "corporate-photo-panel",
    label: "Corporate photo panel",
    platform: "print",
    presetId: "us-letter",
    blurb: "Information-dense flyer with a service list and a full contact block.",
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
    platform: "print",
    presetId: "us-letter",
    blurb: "Restrained flyer built on negative space and one big rounded photo.",
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
    platform: "print",
    presetId: "us-letter",
    blurb: "High-contrast flyer with an arc-masked photo and a hero illustration.",
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
    platform: "print",
    presetId: "us-letter",
    blurb: "Editorial flyer with circular photos, rings and real body copy.",
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

export function isTemplateId(id: string): id is TemplateId {
  return (TEMPLATE_IDS as readonly string[]).includes(id);
}

export function getTemplate(id: string): Template | null {
  return isTemplateId(id) ? TEMPLATES[id] : null;
}

export function templatesByPlatform(platform: Platform): Template[] {
  return TEMPLATE_IDS.map((id) => TEMPLATES[id]).filter(
    (template) => template.platform === platform,
  );
}

/** Skeletons drawn at this exact format. Anything else would need a manual reflow. */
export function templatesForPreset(presetId: string): Template[] {
  return TEMPLATE_IDS.map((id) => TEMPLATES[id]).filter(
    (template) => template.presetId === presetId,
  );
}
