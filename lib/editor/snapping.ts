export type SnapTarget = { position: number; kind: "frame" | "safe" | "layer" };

export type SnapGuide = { axis: "x" | "y"; position: number; kind: SnapTarget["kind"] };

export type SnapResult = { delta: number; guide: SnapGuide | null };

/** Distance in SVG user units within which an edge grabs a guide. */
const THRESHOLD = 7;

/**
 * Snap the three interesting positions of a moving box (start, centre, end)
 * against a set of candidate lines, and return the smallest correction.
 *
 * Returning a delta rather than a corrected position lets the caller apply the
 * same correction to a whole multi-selection without each item drifting apart.
 */
export function snapAxis(
  axis: "x" | "y",
  start: number,
  end: number,
  targets: SnapTarget[],
  scale: number,
): SnapResult {
  // The threshold is in screen terms, so a zoomed-out canvas should not make
  // snapping feel sticky across huge distances.
  const tolerance = THRESHOLD / Math.max(scale, 0.05);
  const center = (start + end) / 2;

  let best: { delta: number; target: SnapTarget } | null = null;

  for (const target of targets) {
    for (const edge of [start, center, end]) {
      const delta = target.position - edge;
      if (Math.abs(delta) > tolerance) continue;
      if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { delta, target };
    }
  }

  if (!best) return { delta: 0, guide: null };

  return {
    delta: best.delta,
    guide: { axis, position: best.target.position, kind: best.target.kind },
  };
}

export function frameTargets(
  axis: "x" | "y",
  frame: { width: number; height: number },
  safe: { top: number; right: number; bottom: number; left: number },
): SnapTarget[] {
  const size = axis === "x" ? frame.width : frame.height;
  const near = axis === "x" ? safe.left : safe.top;
  const far = axis === "x" ? safe.right : safe.bottom;

  return [
    { position: 0, kind: "frame" },
    { position: size / 2, kind: "frame" },
    { position: size, kind: "frame" },
    { position: near, kind: "safe" },
    { position: size - far, kind: "safe" },
  ];
}
