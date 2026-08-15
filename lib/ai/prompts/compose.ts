import "server-only";

import { brandKitPrompt, type BrandKit } from "@/lib/brand/kit";
import { houseStyle } from "@/lib/ai/prompts/house-style";
import { templateCatalog, templateSvg, isTemplateId, type TemplateId } from "@/lib/templates";
import { H_CONSTRAINTS, V_CONSTRAINTS } from "@/lib/svg/validate";
import type { Preset } from "@/lib/layout/presets";

const CONTRACT = `# Output contract

Return exactly one SVG document inside a single fenced \`\`\`svg block. Before the
fence, write at most two short sentences describing what you made. No other prose.

The document is not a picture. It is parsed into an editable layer stack, so its
structure carries as much weight as its appearance. These rules are hard:

1. Root is <svg> with a viewBox matching the target format exactly.
2. Every direct child of <svg> is either a single <defs> or a <g>. Nothing else.
3. Every top-level <g> has a unique, lowercase, kebab-case, semantic id that
   describes its ROLE, not its appearance: "photo-slot", "headline", "logo-lockup",
   "contact", "bg-wash", "accent-discs". Never "group-1" or "rect-4".
4. Every top-level <g> carries data-h and data-v anchoring constraints.
   data-h: ${H_CONSTRAINTS.join(" | ")}
   data-v: ${V_CONSTRAINTS.join(" | ")}
   Pick them by intent: a background is stretch/stretch, a corner ornament is
   scale/scale, a headline is usually left/top, a contact block is left/bottom.
   Never use stretch on something round or on a fixed-aspect ornament: it will be
   distorted into an ellipse when the design is adapted to another format.
5. Every <g> containing <text> also carries data-box="x y w h", the box the text is
   allowed to occupy. Text wrapping is computed from this box, so a wrong box means
   text that overflows or clips.
6. Multi-line text is ONE <text> element with one <tspan> per line, each repeating
   the x and advancing with dy. Never multiple sibling <text> elements for one block.
7. Photo areas are empty placeholder shapes on a <g data-slot="image" data-prompt="...">.
   Draw the masked shape, fill it with a flat neutral, and describe the wanted
   photograph in data-prompt so the app can source or generate it.
8. Figurative illustration is a <g data-slot="illustration" data-prompt="..."> whose
   data-prompt describes the art. Do not attempt to draw people, animals, vehicles or
   scenes in SVG paths: it will look wrong. Geometry, marks and ornament are yours.
9. Small interface glyphs use <g data-icon="phone"> with a lucide icon name. Do not
   draw your own phone, mail or pin glyphs.
10. Forbidden anywhere: <script>, <style>, <use>, <foreignObject>, <iframe>, any
    on* attribute, and any href that is not "#local" or a data:image URI.
11. You cannot measure text, so estimate it and leave slack. A line's rendered width
    is approximately characters x font-size x 0.52 at weight 400-500, or
    characters x font-size x 0.58 at weight 700-800. Compute that before you size any
    container around text, then leave at least 15% headroom. Overflowing a button or a
    badge is the single most common failure in this format, so when the estimate is
    close, drop the font size or shorten the line rather than hoping.
12. Any text group whose text sits inside a bounded container it must not escape (a
    button, pill, badge, or filled panel) carries data-fit="shrink". Headlines carry it
    too. This lets the app scale the text down when your estimate was wrong, which is
    the safety net for rule 11.

Emit 5 to 10 top-level groups in back-to-front order: background, ornament,
photo/illustration slots, panels, text, logo.`;

export type ComposeOptions = {
  preset: Preset;
  brandKit?: BrandKit;
  /** Ids currently in the layer stack. Present on follow-up turns only. */
  currentLayerIds?: string[];
  /** Skeleton to fill, when the user or the router picked one. */
  templateId?: string;
};

export function composePrompt(options: ComposeOptions): string {
  const { preset, brandKit, currentLayerIds, templateId } = options;

  const sections = [
    "You are a senior graphic designer who writes SVG directly.",
    "",
    CONTRACT,
    "",
    houseStyle(preset),
    "",
    brandKitPrompt(brandKit),
    "",
    templateSection(templateId),
  ];

  if (currentLayerIds?.length) {
    sections.push("", followUpSection(currentLayerIds));
  }

  return sections.filter(Boolean).join("\n");
}

function templateSection(templateId?: string): string {
  if (templateId && isTemplateId(templateId)) {
    return [
      "## Skeleton",
      "",
      "Fill the layout below. Keep its layer ids, its constraint choices and its",
      "structural moves. Replace the copy, the palette and the proportions as the brief",
      "requires. You may add or drop a layer where the brief genuinely calls for it.",
      "",
      "```svg",
      templateSvg(templateId as TemplateId),
      "```",
    ].join("\n");
  }

  return [
    "## Skeletons",
    "",
    "Four proven layouts. Pick the one that fits the brief and compose in its spirit,",
    "or compose freely if none fit. Name your choice in your one-line description.",
    "",
    templateCatalog(),
  ].join("\n");
}

function followUpSection(currentLayerIds: string[]): string {
  return [
    "## This is a revision",
    "",
    "The current design has these layers, in order:",
    "",
    ...currentLayerIds.map((id) => `- ${id}`),
    "",
    "Return the COMPLETE updated document, not a fragment.",
    "",
    "Reuse those exact ids for every layer that still exists, even if you changed its",
    "contents. Id stability is what preserves the user's manual edits: a layer whose id",
    "survives keeps the position and size they dragged it to, and a layer whose id",
    "changes is treated as a delete plus an insert, discarding that work.",
    "",
    "Only introduce a new id for a genuinely new layer. Only drop an id when the user",
    "asked for that element to go away.",
  ].join("\n");
}

/** Correction turn sent when the returned document fails the contract. */
export function correctionPrompt(violations: string): string {
  return [
    "The document you returned does not satisfy the output contract:",
    "",
    violations,
    "",
    "Return the corrected full document in a single fenced ```svg block. Fix only these",
    "problems; leave the design itself alone.",
  ].join("\n");
}
