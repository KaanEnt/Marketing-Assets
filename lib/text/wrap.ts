import type { Measure, TextStyle } from "@/lib/text/measure";

export type WrapResult = {
  lines: string[];
  /** Widest rendered line, so callers can tell whether the fit actually worked. */
  width: number;
  /** True when a single word had to be cut mid-word to fit at all. */
  broke: boolean;
};

/**
 * Greedy line breaking against a real measurement function.
 *
 * Greedy rather than Knuth-Plass: marketing copy runs two to five lines, where
 * the optimal algorithm's better raggedness is invisible and its cost is a
 * quadratic number of measurements. Explicit newlines survive as hard breaks,
 * because a designer who pressed Enter meant it.
 */
export function wrapText(
  content: string,
  width: number,
  style: TextStyle,
  measure: Measure,
): WrapResult {
  const lines: string[] = [];
  let broke = false;

  for (const paragraph of content.split(/\r?\n/)) {
    const words = paragraph.split(/[ \t]+/).filter((word) => word.length > 0);

    // A blank line in the source is a deliberate gap, not nothing.
    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let current = "";

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (!current || measure(candidate, style) <= width) {
        current = candidate;
        continue;
      }

      lines.push(current);
      current = word;
    }

    if (current) lines.push(current);
  }

  // A word longer than the column cannot be broken at a space, and leaving it
  // whole means it runs out past the frame edge. Cutting it is ugly; a URL
  // bleeding off the artboard is worse.
  const final: string[] = [];
  for (const line of lines) {
    if (measure(line, style) <= width || !line) {
      final.push(line);
      continue;
    }

    const pieces = breakLine(line, width, style, measure);
    if (pieces.length > 1) broke = true;
    final.push(...pieces);
  }

  return {
    lines: final,
    width: final.reduce((widest, line) => Math.max(widest, measure(line, style)), 0),
    broke,
  };
}

/** Split one over-long line at character boundaries. */
function breakLine(line: string, width: number, style: TextStyle, measure: Measure): string[] {
  const pieces: string[] = [];
  let rest = line;

  while (rest.length > 0) {
    if (measure(rest, style) <= width) {
      pieces.push(rest);
      break;
    }

    // Binary search the longest prefix that fits, rather than stepping a
    // character at a time: a pasted URL can be hundreds of characters.
    let low = 1;
    let high = rest.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (measure(rest.slice(0, mid), style) <= width) low = mid;
      else high = mid - 1;
    }

    pieces.push(rest.slice(0, low));
    rest = rest.slice(low);
  }

  return pieces;
}

export type FitOptions = {
  content: string;
  width: number;
  height: number;
  style: TextStyle;
  lineHeight: number;
  measure: Measure;
  /** Never shrink past this, because unreadable and fitted is not fitted. */
  floor: number;
};

export type FitResult = WrapResult & {
  size: number;
  /** True when the copy still does not fit at the floor size. */
  overflows: boolean;
};

/**
 * Wrap, and shrink the type until the result fits its box.
 *
 * This is the safety net for the one thing the model provably cannot do: it
 * writes SVG without being able to measure a glyph, so it estimates line widths
 * and sometimes estimates wrong. Rather than let a headline run out of its panel,
 * the size comes down until the block fits.
 *
 * The floor is what keeps this honest. Shrinking without a limit turns an
 * overflow into six-unit type that technically fits and cannot be read, so past
 * that point the answer is to report failure and let a human or the model cut
 * words instead.
 */
export function fitText(options: FitOptions): FitResult {
  const { content, width, height, style, lineHeight, measure, floor } = options;

  const at = (size: number): WrapResult & { size: number; height: number } => {
    const wrapped = wrapText(content, width, { ...style, size }, measure);
    return { ...wrapped, size, height: wrapped.lines.length * size * lineHeight };
  };

  const requested = at(style.size);
  if (requested.height <= height && requested.width <= width) {
    return { ...requested, overflows: false };
  }

  const limit = Math.min(floor, style.size);
  let low = limit;
  let high = style.size;
  let best = at(limit);

  // Six halvings put the size within a fraction of a unit of the largest that
  // fits, which is finer than the type scale distinguishes anyway.
  for (let step = 0; step < 6; step += 1) {
    const mid = (low + high) / 2;
    const attempt = at(mid);

    if (attempt.height <= height && attempt.width <= width) {
      best = attempt;
      low = mid;
    } else {
      high = mid;
    }
  }

  return {
    ...best,
    overflows: best.height > height || best.width > width,
  };
}
