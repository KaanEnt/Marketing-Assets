export type TextStyle = {
  family: string;
  size: number;
  weight: number;
  /** In user units, matching the SVG letter-spacing attribute. */
  letterSpacing: number;
};

export type Measure = (text: string, style: TextStyle) => number;

const SVG_NS = "http://www.w3.org/2000/svg";
/** Bounded so a long editing session cannot grow this without limit. */
const CACHE_LIMIT = 4000;

/**
 * Measure text with the engine that will actually draw it.
 *
 * The obvious approach is a canvas 2D context with ctx.font set to the right
 * shorthand, and it is wrong here for two reasons. Documents name their faces as
 * font-family="Archivo", which a stylesheet rewrites to the hashed family
 * next/font actually served, so the shorthand would have to reconstruct a name
 * that only CSS knows. And SVG letter-spacing and kerning do not reproduce
 * exactly in canvas, which matters when the whole point is deciding whether a
 * line fits.
 *
 * A hidden SVG measures the real thing instead. It carries no viewBox, so one
 * user unit is one pixel and getComputedTextLength returns the same units the
 * artboard is authored in, at any zoom.
 *
 * It lives outside the artboard deliberately. Parking a measuring node inside the
 * document would put it in every serialization: the format previews, the adapted
 * documents, and eventually the exported file.
 */
export function createMeasurer(): { measure: Measure; dispose: () => void } {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none";

  const node = document.createElementNS(SVG_NS, "text");
  svg.appendChild(node);
  document.body.appendChild(svg);

  const cache = new Map<string, number>();

  const measure: Measure = (text, style) => {
    if (!text) return 0;

    const key = `${style.family}|${style.size}|${style.weight}|${style.letterSpacing}|${text}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;

    node.setAttribute("font-family", style.family);
    node.setAttribute("font-size", String(style.size));
    node.setAttribute("font-weight", String(style.weight));
    node.setAttribute("letter-spacing", String(style.letterSpacing));
    // Leading and trailing spaces are load-bearing while wrapping, and the
    // default xml:space would collapse them away.
    node.setAttribute("xml:space", "preserve");
    node.textContent = text;

    const width = node.getComputedTextLength();

    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(key, width);
    return width;
  };

  return {
    measure,
    dispose: () => svg.remove(),
  };
}

/**
 * Resolve once the real faces have arrived.
 *
 * Every measurement taken before then describes the fallback face, and the
 * numbers are close enough to look right and wrong enough to overflow a button.
 */
export async function fontsReady(): Promise<void> {
  await document.fonts.ready;
}
