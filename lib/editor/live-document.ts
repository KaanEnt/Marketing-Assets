/**
 * Handle on the document as it actually stands on screen.
 *
 * The store's SVG string is what the model returned. It is not what the user is
 * looking at: icon glyphs are resolved and generated photographs are written into
 * slots after render, deliberately outside React so those nodes survive re-renders.
 * Anything that consumes the finished design — format adaptation now, export
 * later — has to read the live tree or it silently produces a version with empty
 * grey rectangles where the pictures are.
 *
 * A module-level handle rather than context because there is exactly one artboard
 * and threading a ref through every consumer buys nothing.
 */
let root: SVGSVGElement | null = null;

export function registerLiveRoot(next: SVGSVGElement | null) {
  root = next;
}

export function liveRoot(): SVGSVGElement | null {
  return root?.isConnected ? root : null;
}

export function liveSvg(): string | null {
  if (!root?.isConnected) return null;
  return new XMLSerializer().serializeToString(root);
}
