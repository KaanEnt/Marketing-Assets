import { parseHTML } from "linkedom";

import { FONT_NAMES } from "@/lib/text/fonts";
import { ICON_NAMES, isIconName } from "@/lib/svg/icons";
import {
  H_CONSTRAINTS,
  V_CONSTRAINTS,
  isHConstraint,
  isVConstraint,
} from "@/lib/layout/constraints";
import type { Preset } from "@/lib/layout/presets";

export type Violation = {
  /** Stable code so the correction prompt can group repeats. */
  code: string;
  layerId?: string;
  message: string;
};

export type ValidationResult = {
  ok: boolean;
  violations: Violation[];
  groupIds: string[];
};

const ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const MIN_GROUPS = 4;
const MAX_GROUPS = 12;

// Each of these is refused for a concrete downstream reason, stated so the model
// learns the constraint rather than just being told no.
const FORBIDDEN_REASON: Record<string, string> = {
  script: "executable content has no place in a design document",
  foreignobject: "Safari refuses to rasterize it, so PNG export would break",
  style: "CSS blocks can pull external resources and bypass the properties panel",
  iframe: "embedded documents cannot be edited as layers",
  use: "cross-layer references break when a referenced layer is deleted or reordered; inline the shape instead",
};

/**
 * Enforce the SVG contract. Every rule here exists because breaking it breaks the
 * editor downstream: unstable ids scramble the layer panel, missing constraints
 * make format adaptation impossible, and unknown fonts break export fidelity.
 *
 * This is validation, not sanitization. The XSS boundary is the browser, where
 * DOMPurify runs before anything touches the live DOM.
 */
export function validateSvg(
  source: string,
  preset: Preset,
  /** Ids of images the user imported. A slot may bind to one instead of carrying a prompt. */
  assetIds: string[] = [],
): ValidationResult {
  const violations: Violation[] = [];
  const groupIds: string[] = [];
  const add = (code: string, message: string, layerId?: string) =>
    violations.push({ code, message, layerId });

  const { document } = parseHTML(`<html><body>${source}</body></html>`);
  const svg = document.querySelector("svg");

  if (!svg) {
    add("no-svg", "No <svg> element found in the reply.");
    return { ok: false, violations, groupIds };
  }

  const expected = `0 0 ${preset.width} ${preset.height}`;
  const actual = (svg.getAttribute("viewBox") || "").trim().replace(/\s+/g, " ");
  if (actual !== expected) {
    add("viewbox", `viewBox is "${actual}" but preset ${preset.id} requires "${expected}".`);
  }

  for (const element of svg.querySelectorAll("script, foreignObject, style, iframe, use")) {
    const tag = element.tagName.toLowerCase();
    add("forbidden-element", `<${tag}> is not allowed: ${FORBIDDEN_REASON[tag] ?? "unsupported element"}.`);
  }

  for (const element of svg.querySelectorAll("*")) {
    for (const attribute of Array.from(element.attributes) as { name: string; value: string }[]) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on")) {
        add("event-handler", `Event handler attribute "${attribute.name}" is not allowed.`);
      }
      if ((name === "href" || name === "xlink:href") && !isSafeHref(attribute.value)) {
        add("external-ref", `External reference "${attribute.value}" is not allowed.`);
      }
    }
  }

  const children = Array.from(svg.children) as Element[];
  const topLevel = children.filter((child) => child.tagName.toLowerCase() !== "defs");
  const seen = new Set<string>();

  for (const child of topLevel) {
    const tag = child.tagName.toLowerCase();
    if (tag !== "g") {
      add("non-group-child", `Top-level <${tag}> found. Every top-level child must be a <g>.`);
      continue;
    }

    const id = child.getAttribute("id");
    if (!id) {
      add("missing-id", "A top-level <g> has no id. Every layer needs a stable semantic id.");
      continue;
    }

    groupIds.push(id);

    if (!ID_PATTERN.test(id)) {
      add("bad-id", `id "${id}" must be lowercase kebab-case, e.g. "photo-slot".`, id);
    }
    if (seen.has(id)) {
      add("duplicate-id", `id "${id}" appears more than once. Ids must be unique.`, id);
    }
    seen.add(id);

    const h = child.getAttribute("data-h");
    const v = child.getAttribute("data-v");
    if (!h || !isHConstraint(h)) {
      add("bad-constraint", `data-h on "${id}" is "${h ?? "missing"}". Use one of: ${H_CONSTRAINTS.join(", ")}.`, id);
    }
    if (!v || !isVConstraint(v)) {
      add("bad-constraint", `data-v on "${id}" is "${v ?? "missing"}". Use one of: ${V_CONSTRAINTS.join(", ")}.`, id);
    }

    if (child.querySelector("text") && !child.getAttribute("data-box")) {
      add("missing-box", `Layer "${id}" contains text but has no data-box="x y w h". Text cannot wrap without a box.`, id);
    }

    const box = child.getAttribute("data-box");
    if (box && !/^-?\d+(\.\d+)?( -?\d+(\.\d+)?){3}$/.test(box.trim())) {
      add("bad-box", `data-box on "${id}" is "${box}". Expected four numbers: "x y w h".`, id);
    }
  }

  if (topLevel.length < MIN_GROUPS) {
    add("too-few-groups", `Only ${topLevel.length} top-level groups. A real composition needs at least ${MIN_GROUPS}.`);
  }
  if (topLevel.length > MAX_GROUPS) {
    add("too-many-groups", `${topLevel.length} top-level groups. Keep it under ${MAX_GROUPS} so the layer panel stays usable.`);
  }

  for (const element of svg.querySelectorAll("[data-icon]")) {
    const name = element.getAttribute("data-icon") ?? "";
    if (!isIconName(name)) {
      add("bad-icon", `data-icon "${name}" is not available. Use one of: ${ICON_NAMES.join(", ")}.`);
    }
  }

  for (const element of svg.querySelectorAll("[data-slot]")) {
    const kind = element.getAttribute("data-slot");
    if (kind !== "image" && kind !== "illustration") {
      add("bad-slot", `data-slot "${kind}" is invalid. Use "image" or "illustration".`);
      continue;
    }
    const id = element.getAttribute("id") ?? undefined;
    const bound = element.getAttribute("data-asset")?.trim();

    if (bound && !assetIds.includes(bound)) {
      add(
        "unknown-asset",
        `data-asset "${bound}" on "${id ?? "a slot"}" is not an imported image. Available: ${
          assetIds.length ? assetIds.join(", ") : "none"
        }.`,
        id,
      );
    }

    // A slot needs a source. Either the user supplied the picture or the model has to
    // describe one, and a slot with neither silently renders as an empty grey box.
    if (!bound && !element.getAttribute("data-prompt")?.trim()) {
      add(
        "missing-slot-source",
        `Layer "${id ?? "a slot"}" is a ${kind} slot with neither data-prompt nor data-asset, so nothing can fill it.`,
        id,
      );
    }
  }

  const placed = new Set(
    Array.from(svg.querySelectorAll("[data-asset]"))
      .map((element) => element.getAttribute("data-asset")?.trim())
      .filter(Boolean) as string[],
  );

  // Ignoring the import entirely is a dropped instruction, not a design decision, and
  // the failure is invisible: the layout looks fine while the user's photo is absent.
  // Using only some of several imports is left alone, since a brief may well ask for it.
  if (assetIds.length > 0 && placed.size === 0) {
    add(
      "unplaced-assets",
      `The user imported ${assetIds.join(", ")} and the document places none of them. Bind at least one slot with data-asset.`,
    );
  }

  for (const element of svg.querySelectorAll("[font-family]")) {
    // "Source Serif 4, serif" is a legal CSS stack, so judge the first family only.
    // Matching the whole attribute rejects valid output and costs a correction round.
    const family = primaryFamily(element.getAttribute("font-family") || "");
    if (family && !FONT_NAMES.includes(family)) {
      add("bad-font", `font-family "${family}" is not in the permitted set: ${FONT_NAMES.join(", ")}.`);
    }
  }

  return { ok: violations.length === 0, violations, groupIds };
}

/** First family in a CSS font stack, unquoted. */
export function primaryFamily(value: string): string {
  return (value.split(",")[0] ?? "").replace(/["']/g, "").trim();
}

function isSafeHref(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("#") || trimmed.startsWith("data:image/");
}

/** Deduplicated, human-readable violation list for the correction turn. */
export function formatViolations(violations: Violation[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const violation of violations) {
    const key = `${violation.code}:${violation.layerId ?? ""}:${violation.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`- ${violation.message}`);
  }

  return lines.join("\n");
}
