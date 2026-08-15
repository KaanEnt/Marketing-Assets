import { boxesOverlap, type Box } from "@/lib/layout/constraints";
import { safeBox, type Preset } from "@/lib/layout/presets";
import { typeScale } from "@/lib/ai/prompts/house-style";
import { transformedBounds, type BaseBox, type LayerTransform } from "@/lib/editor/transform";

export type IssueCode = "cover" | "outside-safe" | "overflow-safe" | "collision" | "too-small";

export type Issue = {
  code: IssueCode;
  layerId: string;
  message: string;
  /**
   * Whether this pass resolved it. Unfixed issues are the ones worth showing the
   * user and worth handing to the model, since no deterministic rule can help.
   */
  fixed: boolean;
};

/** A layer already solved into the target frame, ready to be checked. */
export type Placed = {
  id: string;
  name: string;
  baseBox: BaseBox;
  transform: LayerTransform;
  h: string;
  v: string;
  hasText: boolean;
  canShrink: boolean;
  /** Smallest authored font-size in the layer, in its own local units. */
  minFontSize: number | null;
};

export type CorrectionResult = {
  transforms: Record<string, LayerTransform>;
  issues: Issue[];
};

/** Gap enforced between two text blocks that would otherwise touch. */
const TEXT_GUTTER = 8;
const COLLISION_PASSES = 3;
/** A layer only counts as a background if it already fills most of the frame. */
const BACKGROUND_COVERAGE = 0.9;

/**
 * Slack held back when clamping into the safe area.
 *
 * A text layer is measured in one render and re-measured in the next, and the two
 * do not agree to the unit: Blink's glyph metrics shift by a fraction when the
 * same document is laid out at a different zoom. Clamping flush to the boundary
 * means that fraction lands on the wrong side of it, and the guarantee this pass
 * exists to make quietly stops being true. Two units is invisible against a
 * sixty-four unit margin and wide enough to absorb the noise.
 */
const SAFE_TOLERANCE = 2;

function clampBox(preset: Preset): Box {
  const safe = safeBox(preset);
  return {
    x: safe.x + SAFE_TOLERANCE,
    y: safe.y + SAFE_TOLERANCE,
    width: safe.width - SAFE_TOLERANCE * 2,
    height: safe.height - SAFE_TOLERANCE * 2,
  };
}

/**
 * Repair what the constraint solver could not know.
 *
 * The solver is deterministic geometry: it places every layer exactly where its
 * anchoring says it belongs. It has no opinion about whether that spot is legal.
 * This pass supplies the opinions, in an order that matters — backgrounds are
 * covered first so later passes measure against a finished frame, shrinking runs
 * before nudging because a layer that does not fit cannot be nudged into fitting,
 * and legibility is judged last because shrinking is what pushes text under the
 * floor in the first place.
 */
export function autoCorrect(items: Placed[], preset: Preset): CorrectionResult {
  const transforms: Record<string, LayerTransform> = {};
  const issues: Issue[] = [];
  const state = new Map(items.map((item) => [item.id, { ...item.transform }]));

  const boundsOf = (item: Placed): Box => {
    const bounds = transformedBounds(state.get(item.id)!, item.baseBox);
    return { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height };
  };

  cover(items, preset, state, boundsOf, issues);
  fitToSafeArea(items, preset, state, boundsOf, issues);
  separate(items, preset, state, boundsOf, issues);
  checkLegibility(items, preset, state, issues);

  for (const [id, transform] of state) transforms[id] = transform;
  return { transforms, issues };
}

/**
 * Grow full-bleed backgrounds so they still reach every edge, plus the print
 * bleed. A background that stops one unit short of the trim leaves a white hairline
 * on the printed sheet, which is the single most common print defect.
 */
function cover(
  items: Placed[],
  preset: Preset,
  state: Map<string, LayerTransform>,
  boundsOf: (item: Placed) => Box,
  issues: Issue[],
) {
  const need: Box = {
    x: -preset.bleed,
    y: -preset.bleed,
    width: preset.width + preset.bleed * 2,
    height: preset.height + preset.bleed * 2,
  };

  for (const item of items) {
    if (item.h !== "stretch" || item.v !== "stretch") continue;

    const before = boundsOf(item);
    // Guards against a mislabelled ornament being blown up to full frame: only
    // something already acting as a background gets treated as one.
    const coverage = (before.width * before.height) / (preset.width * preset.height);
    if (coverage < BACKGROUND_COVERAGE) continue;

    const transform = state.get(item.id)!;
    const kx = before.width >= need.width ? 1 : need.width / before.width;
    const ky = before.height >= need.height ? 1 : need.height / before.height;
    let changed = false;

    if (kx > 1 || ky > 1) {
      state.set(item.id, { ...transform, sx: transform.sx * kx, sy: transform.sy * ky });
      changed = true;
    }

    const after = boundsOf(item);
    const dx = slideToCover(after.x, after.width, need.x, need.width);
    const dy = slideToCover(after.y, after.height, need.y, need.height);

    if (dx !== 0 || dy !== 0) {
      const current = state.get(item.id)!;
      state.set(item.id, { ...current, cx: current.cx + dx, cy: current.cy + dy });
      changed = true;
    }

    if (changed) {
      issues.push({
        code: "cover",
        layerId: item.id,
        message: `${item.name} was extended to cover the frame${preset.bleed > 0 ? " and its bleed" : ""}.`,
        fixed: true,
      });
    }
  }
}

/**
 * Pull load-bearing copy back inside the safe area.
 *
 * Only text is corrected. Photo panels and backgrounds are supposed to run past
 * the margin, and dragging them inward would undo the design rather than fix it.
 * The safe inset exists so copy is not trimmed off a printed sheet or buried under
 * a platform's own interface chrome.
 */
function fitToSafeArea(
  items: Placed[],
  preset: Preset,
  state: Map<string, LayerTransform>,
  boundsOf: (item: Placed) => Box,
  issues: Issue[],
) {
  const safe = clampBox(preset);

  for (const item of items) {
    if (!item.hasText) continue;

    const before = boundsOf(item);
    const oversizeX = before.width > safe.width;
    const oversizeY = before.height > safe.height;

    if (oversizeX || oversizeY) {
      if (item.canShrink) {
        const k = Math.min(safe.width / before.width, safe.height / before.height);
        const transform = state.get(item.id)!;
        // sx and sy scale about cx/cy, which is the layer's own centre, so this
        // shrinks it in place rather than dragging it toward the origin.
        state.set(item.id, { ...transform, sx: transform.sx * k, sy: transform.sy * k });
        issues.push({
          code: "overflow-safe",
          layerId: item.id,
          message: `${item.name} was scaled to ${Math.round(k * 100)}% to fit the safe area.`,
          fixed: true,
        });
      } else {
        issues.push({
          code: "overflow-safe",
          layerId: item.id,
          message: `${item.name} is larger than the safe area and carries no data-fit="shrink", so it cannot be resized automatically.`,
          fixed: false,
        });
        continue;
      }
    }

    const bounds = boundsOf(item);
    const dx = slideInside(bounds.x, bounds.width, safe.x, safe.width);
    const dy = slideInside(bounds.y, bounds.height, safe.y, safe.height);
    if (dx === 0 && dy === 0) continue;

    const transform = state.get(item.id)!;
    state.set(item.id, { ...transform, cx: transform.cx + dx, cy: transform.cy + dy });
    issues.push({
      code: "outside-safe",
      layerId: item.id,
      message: `${item.name} was moved back inside the safe area.`,
      fixed: true,
    });
  }
}

/**
 * Push overlapping text blocks apart.
 *
 * Text over a panel or a photo is deliberate, so only text-versus-text counts as a
 * collision. Separation runs along whichever axis needs the smaller correction,
 * which is what keeps a two-column layout from being unstacked into one column.
 */
function separate(
  items: Placed[],
  preset: Preset,
  state: Map<string, LayerTransform>,
  boundsOf: (item: Placed) => Box,
  issues: Issue[],
) {
  const text = items.filter((item) => item.hasText);
  if (text.length < 2) return;

  const safe = clampBox(preset);
  const moved = new Set<string>();

  for (let pass = 0; pass < COLLISION_PASSES; pass += 1) {
    let clean = true;

    for (let i = 0; i < text.length; i += 1) {
      for (let j = i + 1; j < text.length; j += 1) {
        const a = text[i]!;
        const b = text[j]!;
        const boxA = boundsOf(a);
        const boxB = boundsOf(b);
        if (!boxesOverlap(boxA, boxB, TEXT_GUTTER)) continue;

        clean = false;
        // The block that sits lower and later in z-order yields, so a headline
        // holds its position and the body copy below it makes way.
        const overlapX = Math.min(boxA.x + boxA.width, boxB.x + boxB.width) - Math.max(boxA.x, boxB.x);
        const overlapY = Math.min(boxA.y + boxA.height, boxB.y + boxB.height) - Math.max(boxA.y, boxB.y);

        const target = boxB.y >= boxA.y ? b : a;
        const other = target === b ? boxA : boxB;
        const self = target === b ? boxB : boxA;

        let dx = 0;
        let dy = 0;
        // Separate along the axis with the shallower overlap: the shorter move.
        if (overlapY <= overlapX) {
          dy = self.y >= other.y
            ? other.y + other.height + TEXT_GUTTER - self.y
            : other.y - TEXT_GUTTER - (self.y + self.height);
        } else {
          dx = self.x >= other.x
            ? other.x + other.width + TEXT_GUTTER - self.x
            : other.x - TEXT_GUTTER - (self.x + self.width);
        }

        const transform = state.get(target.id)!;
        state.set(target.id, { ...transform, cx: transform.cx + dx, cy: transform.cy + dy });
        moved.add(target.id);
      }
    }

    if (clean) break;
  }

  // Separation can push a block past the margin, so the safe-area clamp is
  // reapplied to anything that moved rather than trusting the first pass.
  for (const id of moved) {
    const item = text.find((entry) => entry.id === id)!;
    const bounds = boundsOf(item);
    const dx = slideInside(bounds.x, bounds.width, safe.x, safe.width);
    const dy = slideInside(bounds.y, bounds.height, safe.y, safe.height);
    const transform = state.get(id)!;
    if (dx !== 0 || dy !== 0) {
      state.set(id, { ...transform, cx: transform.cx + dx, cy: transform.cy + dy });
    }

    issues.push({
      code: "collision",
      layerId: id,
      message: `${item.name} was moved to clear an overlapping text block.`,
      fixed: true,
    });
  }

  for (let i = 0; i < text.length; i += 1) {
    for (let j = i + 1; j < text.length; j += 1) {
      const a = text[i]!;
      const b = text[j]!;
      if (!boxesOverlap(boundsOf(a), boundsOf(b), 0)) continue;
      issues.push({
        code: "collision",
        layerId: b.id,
        message: `${a.name} and ${b.name} still overlap. There is not enough room in this format for both at their current size.`,
        fixed: false,
      });
    }
  }
}

/**
 * Flag copy that came out too small to read.
 *
 * A wide, short format reached from a tall one scales everything down hard, and
 * the result is often technically correct and practically useless: a caption at
 * eight units on a 627-unit-tall banner. Nothing deterministic can fix this,
 * because the answer is to cut words or restructure the layout, so it is reported
 * for the model to handle.
 */
function checkLegibility(
  items: Placed[],
  preset: Preset,
  state: Map<string, LayerTransform>,
  issues: Issue[],
) {
  const floor = typeScale(preset).floor;

  for (const item of items) {
    if (item.minFontSize === null) continue;

    const transform = state.get(item.id)!;
    // font-size lives in the layer's own coordinate space, so the layer's scale
    // is what converts it into frame units.
    const effective = item.minFontSize * Math.min(Math.abs(transform.sx), Math.abs(transform.sy));
    if (effective >= floor) continue;

    issues.push({
      code: "too-small",
      layerId: item.id,
      message: `${item.name} renders at about ${Math.round(effective)} units, below the ${floor}-unit legibility floor for ${preset.label}.`,
      fixed: false,
    });
  }
}

/** Shift so [start, start+size] fully contains [limit, limit+extent]. */
function slideToCover(start: number, size: number, limit: number, extent: number): number {
  if (start > limit) return limit - start;
  if (start + size < limit + extent) return limit + extent - (start + size);
  return 0;
}

/** Shift so [start, start+size] sits inside [limit, limit+extent]. */
function slideInside(start: number, size: number, limit: number, extent: number): number {
  if (start < limit) return limit - start;
  if (start + size > limit + extent) return limit + extent - (start + size);
  return 0;
}
