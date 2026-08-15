import { FONT_PAIRINGS, FONT_NAMES } from "@/lib/text/fonts";
import type { Preset } from "@/lib/layout/presets";
import { safeBox } from "@/lib/layout/presets";

// Rules distilled from the reference set, expressed as fractions of frame height so
// they hold at every format. Measured off the references rather than invented: the
// headline band, body floor and photo area ratios all come from taking proportions
// off real flyers that work.
const TYPE_BANDS = {
  headline: [0.05, 0.09],
  subhead: [0.024, 0.036],
  body: [0.016, 0.024],
  caption: [0.013, 0.018],
  floor: 0.012,
} as const;

const PHOTO_AREA = [0.3, 0.55] as const;
// A thumbnail lives or dies on a large, legible subject at scroll size, not a small
// inset panel next to copy — so it gets a much bigger allowance.
const PHOTO_AREA_THUMBNAIL = [0.55, 0.85] as const;

export type TypeScale = {
  headline: [number, number];
  subhead: [number, number];
  body: [number, number];
  caption: [number, number];
  floor: number;
};

/** Concrete font-size bands in design units. Far more actionable than percentages. */
export function typeScale(preset: Preset): TypeScale {
  const h = preset.height;
  const band = ([lo, hi]: readonly [number, number]): [number, number] => [
    Math.round(h * lo),
    Math.round(h * hi),
  ];

  return {
    headline: band(TYPE_BANDS.headline),
    subhead: band(TYPE_BANDS.subhead),
    body: band(TYPE_BANDS.body),
    caption: band(TYPE_BANDS.caption),
    floor: Math.max(14, Math.round(h * TYPE_BANDS.floor)),
  };
}

export function houseStyle(preset: Preset): string {
  const scale = typeScale(preset);
  const box = safeBox(preset);
  const photoArea = preset.width * preset.height;
  const isThumbnail = preset.id === "yt-thumb";
  const photoRange = isThumbnail ? PHOTO_AREA_THUMBNAIL : PHOTO_AREA;

  return `# House style

Rules below are non-negotiable unless the user explicitly overrides one. They are
derived from professional reference layouts, not from taste.

## Frame

Format: ${preset.label} (${preset.id}), ${preset.width} x ${preset.height} design units.
Safe area: x ${box.x} to ${box.x + box.width}, y ${box.y} to ${box.y + box.height}.
Nothing load-bearing (text, logo, faces, calls to action) may sit outside the safe area.
${preset.bleed > 0 ? `Bleed: ${preset.bleed} units. Background fills must extend past every edge by at least this much.` : ""}
${preset.note ? `Note: ${preset.note}` : ""}

## Type scale (font-size in design units)

- Headline: ${scale.headline[0]} to ${scale.headline[1]}, weight 700-800, line-height 0.95-1.10, letter-spacing -1% to -3%
- Subhead / CTA: ${scale.subhead[0]} to ${scale.subhead[1]}, weight 600-700
- Body / list items: ${scale.body[0]} to ${scale.body[1]}, weight 400-500, line-height 1.35-1.50
- Caption / contact block: ${scale.caption[0]} to ${scale.caption[1]}, weight 400-600
- Absolute floor: never below ${scale.floor}. Text smaller than this is unreadable at real size.

## Hierarchy

- Exactly one headline per composition. One.
- At most three distinct type sizes below the headline.
- The headline and its surrounding whitespace should occupy 15-35% of frame height.
- Headline runs 1-3 lines. If the copy will not fit in 3 lines at the minimum headline
  size, shorten the copy rather than shrinking past the band.

## Typography

Use one of these pairings. Do not mix families outside a pairing:

${FONT_PAIRINGS.map((p) => `- ${p.display} (display) + ${p.body} (body): ${p.use}`).join("\n")}

Permitted families: ${FONT_NAMES.join(", ")}. No other family is allowed.

## Color

- One dominant color, one accent, plus neutrals. Never more than two saturated hues.
- Dominant covers 50-75% of frame area. Accent stays under 15%.
- Body and headline text must clear 4.5:1 contrast against whatever sits directly behind it.
- Text over photography requires either a translucent panel behind it (opacity 0.85-0.95)
  or a duotone treatment applied to the photo. Never raw text on an untreated photo.

## Photography

${
  isThumbnail
    ? `- The subject is the thumbnail. Let it fill the frame and bleed off two or three
  edges rather than sitting in a small masked panel — a boxed-in photo next to a
  headline is what makes a thumbnail read as a slide instead of a thumbnail.
  A rounded-rect or circle mask is fine for a small secondary inset, never for the
  main subject.`
    : `- Photos are always masked into a shape: rectangle, rounded rectangle, circle, arc, or
  blob. Never dropped in raw edge-to-edge, unless it is the background layer and carries
  a color wash on top of it.`
}
- A photo occupies ${Math.round(photoRange[0] * 100)}-${Math.round(photoRange[1] * 100)}% of frame area (about ${Math.round(photoArea * photoRange[0]).toLocaleString()} to ${Math.round(photoArea * photoRange[1]).toLocaleString()} square units here).
- Apply feColorMatrix for grayscale or duotone when the photo sits under text.

## Composition

${
  isThumbnail
    ? `- No logo lockup, no contact block, no bulleted list, no eyebrow line, no URL. Those
  are flyer furniture; a thumbnail is one subject and one loud claim, nothing else.
- Centering the subject, or pushing it hard to one side with the headline stacked on
  the other, both work. Pick whichever gives the subject the most room.
- One or two bold graphic accents (an arrow, a circle callout, a burst) aimed at the
  subject are welcome here even though they'd be clutter on a flyer.`
    : `- Prefer a strong left or right alignment axis over centering everything.
- Logo lockup anchors to a top corner. Contact block anchors to the bottom margin.
- At most two decorative accent shapes. Restraint reads as professional; clutter does not.`
}
- Leave real negative space. A crowded frame is the most common failure mode.

## Decoration vocabulary

Draw these in SVG. They are what makes output look designed rather than generated:

- clipPath masks (rect, rounded rect, circle, arc, blob) for photography and panels
- Offset outline strokes: a shape with a second, slightly offset stroked copy behind it
- pattern fills: thin repeating vertical lines, diagonal stripe discs, dot halftones
- Multi-stop linearGradient and radialGradient
- Translucent overlay rectangles that tint what sits beneath
- Solid highlight bars sitting behind individual words of a headline
- Concentric arc rings and swooshes framing a circular photo mask
- feColorMatrix filters for grayscale and duotone${
    isThumbnail
      ? `
- Heavy stroke (4-8 units, usually a dark or white outline) around headline text so it
  stays legible over a busy photo at small preview size
- A soft drop shadow (feDropShadow or an offset blurred duplicate) under the headline
  and under any graphic accent, for the same reason`
      : ""
  }

## Structure

Emit 5 to 10 top-level groups, in this z-order:

1. background wash
2. decorative pattern or accent shapes
3. photo or illustration slots
4. panels and containers
5. text groups
6. logo lockup

Fewer than 5 groups is thin. More than 10 is cluttered and hard to edit.`;
}
