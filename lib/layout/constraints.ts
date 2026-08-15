export const H_CONSTRAINTS = ["left", "right", "center", "scale", "stretch"] as const;
export const V_CONSTRAINTS = ["top", "bottom", "center", "scale", "stretch"] as const;

export type HConstraint = (typeof H_CONSTRAINTS)[number];
export type VConstraint = (typeof V_CONSTRAINTS)[number];

export type Box = { x: number; y: number; width: number; height: number };
export type Frame = { width: number; height: number };

/**
 * Whether a layer is allowed to change shape at all.
 *
 * "flexible" honours the layer's constraints literally, which means a stretch
 * axis really does span the new frame. "rigid" refuses to distort under any
 * constraint: the layer scales by a single factor and merely sits inside the
 * region stretch would have given it. Text is always rigid, because condensed
 * type reads as broken in a way a recropped photograph never does.
 */
export type AspectMode = "flexible" | "rigid";

/** A stretched layer can never be solved to nothing. */
const MIN_SIZE = 1;

type AxisRule = "near" | "far" | "center" | "scale" | "stretch";

/**
 * The anchoring model.
 *
 * This deliberately diverges from Figma on one point: the gap between a layer and
 * the edge it anchors to is scaled by the same factor as the layer, rather than
 * held at its absolute value. Figma holds margins fixed because it resizes UI
 * within one medium, where 16px of padding means 16px at any window size. We
 * transpose a composition between media, where whitespace is part of the design.
 * Holding a 56-unit margin while the frame grows from 850 to 1080 units wide
 * quietly tightens every margin in the layout and the composition stops breathing.
 *
 * Scaling the gap keeps the optical rhythm intact, and anchoring still does its
 * real job: a bottom-anchored contact block stays at the bottom instead of
 * floating into the middle of a much taller frame.
 */
function solveAxis(
  start: number,
  size: number,
  from: number,
  to: number,
  rule: AxisRule,
  k: number,
): { start: number; size: number } {
  const trailing = from - start - size;
  const scaled = size * k;

  switch (rule) {
    case "near":
      return { start: start * k, size: scaled };
    case "far":
      return { start: to - trailing * k - scaled, size: scaled };
    case "center": {
      const offset = start + size / 2 - from / 2;
      return { start: to / 2 + offset * k - scaled / 2, size: scaled };
    }
    case "scale": {
      // Proportional placement in the frame rather than a fixed gap: what a
      // corner ornament or a floating accent disc wants.
      const center = ((start + size / 2) / from) * to;
      return { start: center - scaled / 2, size: scaled };
    }
    case "stretch": {
      const leading = start * k;
      return { start: leading, size: Math.max(MIN_SIZE, to - leading - trailing * k) };
    }
  }
}

export function solveBox(
  box: Box,
  from: Frame,
  to: Frame,
  constraints: { h: string; v: string },
  aspect: AspectMode = "rigid",
): Box {
  const fx = from.width === 0 ? 1 : to.width / from.width;
  const fy = from.height === 0 ? 1 : to.height / from.height;
  const uniform = Math.min(fx, fy);

  const hRule = axisRule(constraints.h, "h");
  const vRule = axisRule(constraints.v, "v");

  /**
   * A stretch axis is the author declaring that this layer may change shape along
   * it: a background wash, a full-height rule, a photo panel that should widen.
   * That declaration is the only thing that grants a per-axis factor. Everything
   * else takes the single uniform factor, which is what keeps a circular mask
   * circular and a logo lockup square when the frame's proportions change.
   */
  const kx = aspect === "flexible" && hRule === "stretch" ? fx : uniform;
  const ky = aspect === "flexible" && vRule === "stretch" ? fy : uniform;

  const h = solveAxis(box.x, box.width, from.width, to.width, hRule, kx);
  const v = solveAxis(box.y, box.height, from.height, to.height, vRule, ky);

  if (aspect === "flexible") {
    return { x: h.start, y: v.start, width: h.size, height: v.size };
  }

  // Rigid keeps its own proportions. On a stretch axis the solve still produced a
  // region to sit in, so the layer keeps its scaled size at that region's leading
  // edge rather than being smeared across the frame. Losing the stretch is the
  // price of not distorting; the alignment axis is what survives, and that is the
  // part a reader notices.
  return { x: h.start, y: v.start, width: box.width * uniform, height: box.height * uniform };
}

/** The factor a uniform layer scales by, exposed for the legibility check. */
export function uniformFactor(from: Frame, to: Frame): number {
  if (from.width === 0 || from.height === 0) return 1;
  return Math.min(to.width / from.width, to.height / from.height);
}

function axisRule(value: string, axis: "h" | "v"): AxisRule {
  const near = axis === "h" ? "left" : "top";
  const far = axis === "h" ? "right" : "bottom";

  if (value === near) return "near";
  if (value === far) return "far";
  if (value === "center" || value === "scale" || value === "stretch") return value;
  // The validator rejects anything else on generated documents, so this only
  // catches hand-edited markup. Proportional placement is the least destructive
  // reading of an unknown intent.
  return "scale";
}

export function isHConstraint(value: string): value is HConstraint {
  return (H_CONSTRAINTS as readonly string[]).includes(value);
}

export function isVConstraint(value: string): value is VConstraint {
  return (V_CONSTRAINTS as readonly string[]).includes(value);
}

export function boxesOverlap(a: Box, b: Box, margin = 0): boolean {
  return (
    a.x < b.x + b.width + margin &&
    b.x < a.x + a.width + margin &&
    a.y < b.y + b.height + margin &&
    b.y < a.y + a.height + margin
  );
}
