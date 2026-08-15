import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { TEMPLATES, TEMPLATE_IDS, type Template, type TemplateId } from "@/lib/templates/catalog";
import type { Preset } from "@/lib/layout/presets";

export * from "@/lib/templates/catalog";

const cache = new Map<TemplateId, string>();

/** Raw SVG source. Read from disk so the files stay openable in a real SVG editor. */
export function templateSvg(id: TemplateId): string {
  const cached = cache.get(id);
  if (cached) return cached;

  const svg = readFileSync(join(process.cwd(), "lib", "templates", `${id}.svg`), "utf8");
  cache.set(id, svg);
  return svg;
}

/**
 * Every skeleton paired with its source, for the picker.
 *
 * The file is its own thumbnail: what the card shows is exactly the document the
 * model is handed, so the gallery cannot drift from what generation actually does.
 * Def ids are unique per file, which is what lets eleven of these share one page
 * without borrowing each other's masks, patterns and gradients. Top-level layer
 * ids do repeat across files and are deliberately left alone, because those are
 * the layer identities the editor is built on and nothing resolves them by url().
 */
export function templateGallery(): (Template & { svg: string })[] {
  return TEMPLATE_IDS.map((id) => ({ ...TEMPLATES[id], svg: templateSvg(id) }));
}

/**
 * Catalog shown to the model when it has to choose a skeleton itself.
 *
 * Filtered to the skeletons actually drawn at this format. Offering a Letter
 * flyer as the model's reference for a YouTube thumbnail is worse than offering
 * nothing: the proportions do not transfer, and the flyer's furniture (service
 * list, contact block) is wrong for the medium.
 */
export function templateCatalog(preset: Preset): string {
  const matching = TEMPLATE_IDS.map((id) => TEMPLATES[id]).filter(
    (template) => template.presetId === preset.id,
  );

  if (matching.length === 0) {
    return [
      "## Skeleton",
      "",
      `No stock layout is drawn at ${preset.label}, so compose freely from the house`,
      "style rather than adapting a layout built for another format.",
    ].join("\n");
  }

  return [
    "## Skeletons",
    "",
    `Proven layouts drawn at ${preset.label}. Pick the one that fits the brief and`,
    "compose in its spirit, or compose freely if none fit. Name your choice in your",
    "one-line description.",
    "",
    matching.map(describe).join("\n\n"),
  ].join("\n");
}

/** The skeleton itself, when the user picked one from the gallery. */
export function templateBrief(template: Template): string {
  return [
    "## Skeleton",
    "",
    `The user picked "${template.label}". ${template.use}`,
    "",
    "Fill the layout below. Keep its layer ids, its constraint choices and its",
    "structural moves. Replace the copy, the palette and the proportions as the brief",
    "requires. You may add or drop a layer where the brief genuinely calls for it.",
    "",
    "The moves that define it, so you can vary it without losing the shape:",
    "",
    ...template.techniques.map((technique) => `- ${technique}`),
    "",
    "```svg",
    templateSvg(template.id),
    "```",
  ].join("\n");
}

function describe(template: Template): string {
  return [
    `### ${template.id}`,
    template.use,
    ...template.techniques.map((technique) => `- ${technique}`),
  ].join("\n");
}
