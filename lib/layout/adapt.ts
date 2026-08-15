import { solveBox, type AspectMode, type Box } from "@/lib/layout/constraints";
import { autoCorrect, type Issue, type Placed } from "@/lib/layout/autocorrect";
import { viewBox, type Preset } from "@/lib/layout/presets";
import { namespaceIds } from "@/lib/svg/namespace";
import {
  identityTransform,
  isIdentity,
  toSvgTransform,
  transformedBounds,
  type BaseBox,
  type LayerTransform,
} from "@/lib/editor/transform";

/** What the editor knows about a layer, joined with what the document knows. */
export type LayerState = {
  id: string;
  name: string;
  h: string;
  v: string;
  baseBox: BaseBox;
  transform: LayerTransform;
};

export type AdaptCandidate = {
  preset: Preset;
  /** Ready to hand to the editor: viewBox swapped, transforms baked in, real ids. */
  svg: string;
  /** The same document with namespaced ids, safe to render next to the artboard. */
  preview: string;
  transforms: Record<string, LayerTransform>;
  issues: Issue[];
};

/**
 * Re-solve a design into a different format.
 *
 * Deterministic and instant: no model call, no network. That is the point. A
 * Letter flyer becoming an Instagram story is a violent reflow, but it is still
 * arithmetic, and arithmetic that runs in a millisecond can be shown as a live
 * thumbnail the user accepts or rejects. The model is only worth spending on the
 * cases arithmetic provably could not fix, which is what the issue list identifies.
 */
export function adaptDocument(
  source: string,
  layers: LayerState[],
  from: Preset,
  to: Preset,
): AdaptCandidate | null {
  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = document.querySelector("svg");
  if (!root || document.querySelector("parsererror")) return null;

  const placed: Placed[] = [];

  for (const layer of layers) {
    const node = root.querySelector(`#${CSS.escape(layer.id)}`);
    if (!node) continue;

    const meta = readMeta(node);
    const sourceBox = renderedBox(layer, meta.declaredBox);
    if (sourceBox.width <= 0 || sourceBox.height <= 0) continue;

    const solved = solveBox(sourceBox, from, to, { h: layer.h, v: layer.v }, aspectFor(layer, meta));

    placed.push({
      id: layer.id,
      name: layer.name,
      baseBox: layer.baseBox,
      transform: retarget(layer.transform, sourceBox, solved),
      h: layer.h,
      v: layer.v,
      hasText: meta.hasText,
      canShrink: meta.canShrink,
      minFontSize: meta.minFontSize,
    });
  }

  const { transforms, issues } = autoCorrect(placed, to);
  const boxes = new Map(placed.map((item) => [item.id, item.baseBox]));
  const baked = bake(root, to, transforms, boxes);
  const serializer = new XMLSerializer();

  return {
    preset: to,
    svg: serializer.serializeToString(baked),
    preview: serializer.serializeToString(
      namespaceIds(baked.cloneNode(true) as SVGSVGElement, `${to.id}-`),
    ),
    transforms,
    issues,
  };
}

/**
 * The layer's box as it currently reads on screen.
 *
 * A declared data-box wins over the measured bounds, because anchoring should
 * respect the author's intended container rather than the ink. A right-anchored
 * text block's margin is the gap from its box to the edge; measuring from where
 * its longest line happens to end would make the margin jump every time the copy
 * changes. The user's own transform is folded in either way, so a layer they
 * dragged adapts from where they put it.
 */
function renderedBox(layer: LayerState, declared: Box | null): Box {
  const transform = layer.transform;

  if (declared && transform.angle === 0) {
    const base = identityTransform(layer.baseBox);
    return {
      x: transform.cx + (declared.x - base.cx) * transform.sx,
      y: transform.cy + (declared.y - base.cy) * transform.sy,
      width: declared.width * transform.sx,
      height: declared.height * transform.sy,
    };
  }

  const bounds = transformedBounds(transform, layer.baseBox);
  return { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height };
}

/** Compose the source-to-target mapping onto the transform the user already had. */
function retarget(transform: LayerTransform, from: Box, to: Box): LayerTransform {
  const kx = from.width === 0 ? 1 : to.width / from.width;
  const ky = from.height === 0 ? 1 : to.height / from.height;

  return {
    cx: to.x + (transform.cx - from.x) * kx,
    cy: to.y + (transform.cy - from.y) * ky,
    sx: transform.sx * kx,
    sy: transform.sy * ky,
    angle: transform.angle,
  };
}

/**
 * Two layers are never allowed to change shape, whatever their constraints say.
 *
 * Text, because condensed or expanded type is the most obvious tell that a design
 * was machine-resized. Rotated layers, because a non-uniform scale and a rotation
 * do not commute: composing them shears the layer instead of resizing it.
 */
function aspectFor(layer: LayerState, meta: Meta): AspectMode {
  if (layer.transform.angle !== 0 || meta.hasText) return "rigid";
  return "flexible";
}

type Meta = {
  declaredBox: Box | null;
  hasText: boolean;
  canShrink: boolean;
  minFontSize: number | null;
};

function readMeta(node: Element): Meta {
  let minFontSize: number | null = null;
  for (const element of Array.from(node.querySelectorAll("[font-size]"))) {
    const size = Number.parseFloat(element.getAttribute("font-size") ?? "");
    if (!Number.isFinite(size) || size <= 0) continue;
    minFontSize = minFontSize === null ? size : Math.min(minFontSize, size);
  }

  return {
    declaredBox: parseBox(node.getAttribute("data-box")),
    hasText: node.querySelector("text") !== null,
    canShrink: node.getAttribute("data-fit") === "shrink",
    minFontSize,
  };
}

function parseBox(value: string | null): Box | null {
  if (!value) return null;
  const parts = value.trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  const [x, y, width, height] = parts as [number, number, number, number];
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

/** Write the solved layout into a standalone document. */
function bake(
  source: SVGSVGElement,
  preset: Preset,
  transforms: Record<string, LayerTransform>,
  boxes: Map<string, BaseBox>,
): SVGSVGElement {
  const root = source.cloneNode(true) as SVGSVGElement;
  root.setAttribute("viewBox", viewBox(preset));
  root.setAttribute("data-preset", preset.id);
  // Injected for display; a standalone document should size itself.
  root.removeAttribute("style");
  root.removeAttribute("width");
  root.removeAttribute("height");

  for (const [id, transform] of Object.entries(transforms)) {
    const node = root.querySelector(`#${CSS.escape(id)}`);
    const box = boxes.get(id);
    if (!node || !box) continue;

    if (isIdentity(transform, box)) node.removeAttribute("transform");
    else node.setAttribute("transform", toSvgTransform(transform, box));

    counterScaleArt(node, transform);
  }

  return root;
}

/**
 * Keep generated pictures proportional inside a reshaped slot.
 *
 * A photo panel is allowed to change shape, and should: a tall crop in a Letter
 * flyer becomes a wide crop in a LinkedIn banner. The mask reshaping is the
 * intent. The photograph inside stretching with it is not, and preserveAspectRatio
 * cannot help, because it fits the picture to a rectangle that the group's own
 * transform then distorts.
 *
 * So the picture carries a counter-scale that cancels the anisotropy. Whichever
 * axis was scaled less is stretched back up, which makes the net scale uniform and
 * simultaneously guarantees the picture still covers the mask rather than leaving
 * a gap along one edge.
 */
function counterScaleArt(node: Element, transform: LayerTransform) {
  const image = node.querySelector("image[data-generated]");
  if (!image) return;

  const ratio = Math.abs(transform.sy) < 1e-6 ? 1 : Math.abs(transform.sx / transform.sy);
  if (Math.abs(ratio - 1) < 1e-4) {
    image.removeAttribute("transform");
    return;
  }

  const x = Number.parseFloat(image.getAttribute("x") ?? "0");
  const y = Number.parseFloat(image.getAttribute("y") ?? "0");
  const width = Number.parseFloat(image.getAttribute("width") ?? "0");
  const height = Number.parseFloat(image.getAttribute("height") ?? "0");
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;

  const cx = x + width / 2;
  const cy = y + height / 2;
  const [sx, sy] = ratio >= 1 ? [1, ratio] : [1 / ratio, 1];

  image.setAttribute(
    "transform",
    `translate(${round(cx)} ${round(cy)}) scale(${round(sx, 4)} ${round(sy, 4)}) translate(${round(-cx)} ${round(-cy)})`,
  );
}

function round(value: number, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
