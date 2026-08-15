import { parseHTML } from "linkedom";

import { FONT_NAMES } from "@/lib/text/fonts";
import type { Preset } from "@/lib/layout/presets";

export const H_CONSTRAINTS = ["left", "right", "center", "scale", "stretch"] as const;
export const V_CONSTRAINTS = ["top", "bottom", "center", "scale", "stretch"] as const;

export type HConstraint = (typeof H_CONSTRAINTS)[number];
export type VConstraint = (typeof V_CONSTRAINTS)[number];

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
export function validateSvg(source: string, preset: Preset): ValidationResult {
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

  for (const element of svg.querySelectorAll("[font-family]")) {
    const family = (element.getAttribute("font-family") || "").replace(/["']/g, "").trim();
    if (family && !FONT_NAMES.includes(family)) {
      add("bad-font", `font-family "${family}" is not in the permitted set: ${FONT_NAMES.join(", ")}.`);
    }
  }

  return { ok: violations.length === 0, violations, groupIds };
}

function isSafeHref(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("#") || trimmed.startsWith("data:image/");
}

export function isHConstraint(value: string): value is HConstraint {
  return (H_CONSTRAINTS as readonly string[]).includes(value);
}

export function isVConstraint(value: string): value is VConstraint {
  return (V_CONSTRAINTS as readonly string[]).includes(value);
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
