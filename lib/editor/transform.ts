/**
 * A layer's user edit, kept separate from the geometry the model authored.
 *
 * Regeneration replaces authored geometry; this survives it. Storing a centre
 * point plus scale and angle (rather than a raw matrix) keeps the round trip to
 * Fabric lossless, since those are exactly the handles Fabric manipulates.
 */
export type LayerTransform = {
  /** Centre of the layer in SVG user units. */
  cx: number;
  cy: number;
  sx: number;
  sy: number;
  /** Degrees, clockwise, about the centre. */
  angle: number;
};

/** Untransformed bounding box of the authored geometry, in SVG user units. */
export type BaseBox = { x: number; y: number; width: number; height: number };

export function identityTransform(box: BaseBox): LayerTransform {
  return {
    cx: box.x + box.width / 2,
    cy: box.y + box.height / 2,
    sx: 1,
    sy: 1,
    angle: 0,
  };
}

export function isIdentity(transform: LayerTransform, box: BaseBox): boolean {
  return sameTransform(transform, identityTransform(box));
}

export function sameTransform(a: LayerTransform, b: LayerTransform): boolean {
  return (
    near(a.cx, b.cx) && near(a.cy, b.cy) && near(a.sx, b.sx) && near(a.sy, b.sy) && near(a.angle, b.angle)
  );
}

/**
 * Compose the SVG transform attribute.
 *
 * Reads right to left: move the authored geometry so its centre sits at the
 * origin, scale and rotate it there, then move it to the target centre. Doing it
 * in that order is what makes rotation happen about the layer's own centre
 * rather than about the artboard origin.
 */
export function toSvgTransform(transform: LayerTransform, box: BaseBox): string {
  const base = identityTransform(box);
  return [
    `translate(${round(transform.cx)} ${round(transform.cy)})`,
    `rotate(${round(transform.angle)})`,
    `scale(${round(transform.sx, 4)} ${round(transform.sy, 4)})`,
    `translate(${round(-base.cx)} ${round(-base.cy)})`,
  ].join(" ");
}

/** Axis-aligned bounds after the transform, used for snapping and safe-area checks. */
export function transformedBounds(transform: LayerTransform, box: BaseBox) {
  const halfWidth = (box.width * Math.abs(transform.sx)) / 2;
  const halfHeight = (box.height * Math.abs(transform.sy)) / 2;
  const radians = (transform.angle * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));

  // Half-extents of the rotated rectangle's axis-aligned hull.
  const extentX = halfWidth * cos + halfHeight * sin;
  const extentY = halfWidth * sin + halfHeight * cos;

  return {
    left: transform.cx - extentX,
    top: transform.cy - extentY,
    right: transform.cx + extentX,
    bottom: transform.cy + extentY,
    width: extentX * 2,
    height: extentY * 2,
  };
}

function near(a: number, b: number, epsilon = 0.001) {
  return Math.abs(a - b) < epsilon;
}

function round(value: number, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
