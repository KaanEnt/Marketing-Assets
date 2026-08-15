import type { Measure, TextStyle } from "@/lib/text/measure";
import { blockDrop, fitText, wrapText } from "@/lib/text/wrap";

const SVG_NS = "http://www.w3.org/2000/svg";
/** Kept clear between two text blocks sharing a row, in user units. */
const COLUMN_GUTTER = 16;
const DEFAULT_LINE_HEIGHT = 1.25;

export type Anchor = "start" | "middle" | "end";

export type RunStyle = {
  family: string;
  size: number;
  weight: number;
  fill: string;
  letterSpacing: number;
  /** Multiple of the font size. */
  lineHeight: number;
  anchor: Anchor;
};

export type Box = { x: number; y: number; width: number; height: number };

/**
 * One editable block of copy.
 *
 * The layer is the group, because that is what carries a transform and a row in
 * the panel. The editable unit is a single <text> inside it, because a contact
 * block is legitimately two columns and a mission panel is a heading plus two
 * paragraphs. Treating the group as the unit would make those uneditable.
 */
export type TextRun = {
  /** Stable within a document revision: the layer id and the run's ordinal. */
  key: string;
  layerId: string;
  index: number;
  /** The logical copy, hard breaks only. */
  content: string;
  /** The lines as authored, kept so an undone edit can be put back exactly. */
  lines: string[];
  style: RunStyle;
  x: number;
  /** Baseline of the first line, in the group's own coordinates. */
  baseline: number;
  /** What this run is allowed to occupy. */
  column: Box;
  canShrink: boolean;
};

/**
 * A user's change to one block of copy.
 *
 * Held as a patch beside the document rather than written into the document
 * string, for the same reason generated pictures are: pushing an edit back
 * through the store would re-set innerHTML, destroying the nodes Fabric measures
 * against and every transform with them. The DOM is the working surface; this is
 * what has to survive it being rebuilt.
 */
export type TextEdit = {
  content?: string;
  family?: string;
  size?: number;
  weight?: number;
  fill?: string;
  letterSpacing?: number;
  lineHeight?: number;
  anchor?: Anchor;
  fit?: "shrink" | "none";
};

/** The run as it should currently render: what was authored, under any edit. */
export function effectiveRun(run: TextRun, edit?: TextEdit): TextRun {
  if (!edit) return run;

  return {
    ...run,
    content: edit.content ?? run.content,
    canShrink: edit.fit ? edit.fit === "shrink" : run.canShrink,
    style: {
      family: edit.family ?? run.style.family,
      size: edit.size ?? run.style.size,
      weight: edit.weight ?? run.style.weight,
      fill: edit.fill ?? run.style.fill,
      letterSpacing: edit.letterSpacing ?? run.style.letterSpacing,
      lineHeight: edit.lineHeight ?? run.style.lineHeight,
      anchor: edit.anchor ?? run.style.anchor,
    },
  };
}

export function runKey(layerId: string, index: number): string {
  return `${layerId}#${index}`;
}

export function findRuns(group: SVGGElement, layerId: string): TextRun[] {
  const elements = Array.from(group.querySelectorAll("text"));
  if (elements.length === 0) return [];

  const box = parseBox(group.getAttribute("data-box")) ?? boxOf(group);
  const canShrink = group.getAttribute("data-fit") === "shrink";
  const frames = elements.map((element) => boxOf(element));

  return elements.map((element, index) => {
    const style = readStyle(element);
    const x = anchorX(element);

    return {
      key: runKey(layerId, index),
      layerId,
      index,
      content: readContent(element),
      lines: readLines(element),
      style,
      x,
      baseline: firstBaseline(element),
      column: columnFor(box, frames, index, x, style.anchor),
      canShrink,
    };
  });
}

export function runElement(group: SVGGElement, index: number): SVGTextElement | null {
  return Array.from(group.querySelectorAll("text"))[index] ?? null;
}

/** Width this run may use, derived from its anchor and its column. */
export function availableWidth(run: TextRun): number {
  const right = run.column.x + run.column.width;

  if (run.style.anchor === "start") return Math.max(1, right - run.x);
  if (run.style.anchor === "end") return Math.max(1, run.x - run.column.x);
  return Math.max(1, Math.min(run.x - run.column.x, right - run.x) * 2);
}

export type LayoutResult = {
  lines: string[];
  size: number;
  overflows: boolean;
};

/**
 * Lay a run out and write it back into the document.
 *
 * Returns what actually happened rather than nothing, because the caller needs to
 * know when the copy did not fit: that is the signal the properties panel shows
 * and the reason shrink-to-fit exists.
 */
export function layoutRun(
  element: SVGTextElement,
  run: TextRun,
  measure: Measure,
  floor: number,
): LayoutResult {
  const width = availableWidth(run);
  const style: TextStyle = {
    family: run.style.family,
    size: run.style.size,
    weight: run.style.weight,
    letterSpacing: run.style.letterSpacing,
  };

  // What the block actually has to fit into: the room left between its first
  // baseline and the bottom of its box, not the box's full height.
  const room = run.column.y + run.column.height - run.baseline;

  const result = run.canShrink
    ? fitText({
        content: run.content,
        width,
        height: room,
        style,
        lineHeight: run.style.lineHeight,
        measure,
        floor,
      })
    : { ...wrapText(run.content, width, style, measure), size: run.style.size, overflows: false };

  writeRun(element, result.lines, { ...run.style, size: result.size }, run.x, run.baseline);

  const drop = blockDrop(result.lines.length, result.size, run.style.lineHeight);
  return {
    lines: result.lines,
    size: result.size,
    overflows: result.overflows || result.width > width || drop > room,
  };
}

/** Replace a run's rendered lines with one tspan each. */
export function writeRun(
  element: SVGTextElement,
  lines: string[],
  style: RunStyle,
  x: number,
  baseline: number,
) {
  element.setAttribute("font-family", style.family);
  element.setAttribute("font-size", String(round(style.size)));
  element.setAttribute("font-weight", String(style.weight));
  element.setAttribute("fill", style.fill);
  element.setAttribute("text-anchor", style.anchor);
  element.setAttribute("x", String(round(x)));
  element.setAttribute("y", String(round(baseline)));

  if (style.letterSpacing) element.setAttribute("letter-spacing", String(round(style.letterSpacing, 3)));
  else element.removeAttribute("letter-spacing");

  element.replaceChildren();

  const step = style.size * style.lineHeight;
  let written = 0;
  let pending = 0;

  for (const line of lines) {
    // A blank line is vertical space, not an empty tspan. Empty tspans advance
    // the text position inconsistently across engines, so the gap is folded into
    // the next real line's dy instead.
    if (!line) {
      pending += step;
      continue;
    }

    const tspan = document.createElementNS(SVG_NS, "tspan");
    tspan.setAttribute("x", String(round(x)));
    tspan.setAttribute("dy", String(round(written === 0 ? pending : step + pending)));
    tspan.textContent = line;
    element.appendChild(tspan);

    pending = 0;
    written += 1;
  }
}

function readLines(element: SVGTextElement): string[] {
  const tspans = Array.from(element.querySelectorAll("tspan"));
  if (tspans.length === 0) return [(element.textContent ?? "").trim()];
  return tspans.map((tspan) => (tspan.textContent ?? "").trim());
}

function readContent(element: SVGTextElement): string {
  const tspans = Array.from(element.querySelectorAll("tspan"));
  if (tspans.length === 0) return (element.textContent ?? "").trim();

  // Authored breaks are treated as soft: they are the model's guess at where the
  // lines fall, not the writer's intent, so re-wrapping is free to move them.
  // Only an edit introduces a hard break, and only where the user pressed Enter.
  return tspans
    .map((tspan) => (tspan.textContent ?? "").trim())
    .filter((line) => line.length > 0)
    .join(" ");
}

function readStyle(element: SVGTextElement): RunStyle {
  const computed = getComputedStyle(element);
  const size = number(element.getAttribute("font-size")) ?? (Number.parseFloat(computed.fontSize) || 16);

  return {
    // The attribute, not the computed value: the stylesheet rewrites the family
    // to next/font's hashed name, which is not something to write back out.
    family: element.getAttribute("font-family") ?? "Inter",
    size,
    weight: number(element.getAttribute("font-weight")) ?? (Number.parseInt(computed.fontWeight) || 400),
    fill: element.getAttribute("fill") ?? computed.fill ?? "#111111",
    letterSpacing: number(element.getAttribute("letter-spacing")) ?? 0,
    lineHeight: readLineHeight(element, size),
    anchor: readAnchor(element.getAttribute("text-anchor")),
  };
}

/** Recover the leading the author used, since SVG stores it as a per-line dy. */
function readLineHeight(element: SVGTextElement, size: number): number {
  const tspans = Array.from(element.querySelectorAll("tspan"));
  for (const tspan of tspans.slice(1)) {
    const dy = number(tspan.getAttribute("dy"));
    if (dy && dy > 0 && size > 0) return dy / size;
  }
  return DEFAULT_LINE_HEIGHT;
}

function readAnchor(value: string | null): Anchor {
  return value === "middle" || value === "end" ? value : "start";
}

function anchorX(element: SVGTextElement): number {
  const tspan = element.querySelector("tspan");
  return number(tspan?.getAttribute("x")) ?? number(element.getAttribute("x")) ?? 0;
}

function firstBaseline(element: SVGTextElement): number {
  return number(element.getAttribute("y")) ?? 0;
}

/**
 * How much room this run has before it runs into something.
 *
 * The declared box belongs to the whole layer, so a two-column contact block
 * would let its left column wrap straight across its right one. A run that has a
 * neighbour starting to its right on the same rows stops at that neighbour.
 */
function columnFor(box: Box, frames: Box[], index: number, x: number, anchor: Anchor): Box {
  const self = frames[index];
  if (!self) return box;

  let right = box.x + box.width;
  let left = box.x;

  for (let other = 0; other < frames.length; other += 1) {
    if (other === index) continue;
    const peer = frames[other];
    if (!peer) continue;

    const sharesRows = peer.y < self.y + self.height && self.y < peer.y + peer.height;
    if (!sharesRows) continue;

    if (peer.x >= self.x + self.width) right = Math.min(right, peer.x - COLUMN_GUTTER);
    else if (peer.x + peer.width <= self.x) left = Math.max(left, peer.x + peer.width + COLUMN_GUTTER);
  }

  // An anchor outside its own column means the authored geometry disagrees with
  // the declared box; trust the anchor, since that is what renders.
  if (anchor === "start" && x < left) left = x;
  if (anchor === "end" && x > right) right = x;

  return { x: left, y: box.y, width: Math.max(1, right - left), height: box.height };
}

function boxOf(element: SVGGraphicsElement): Box {
  const box = element.getBBox();
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

function parseBox(value: string | null): Box | null {
  if (!value) return null;
  const parts = value.trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  const [x, y, width, height] = parts as [number, number, number, number];
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

function number(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value: number, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
