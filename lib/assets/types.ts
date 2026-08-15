import type { EnhanceMode } from "@/lib/images/modes";

/**
 * Transparent art must never be clipped to a slot's mask shape or its silhouette is
 * cut off, so the kind decides how the image is placed rather than being cosmetic.
 */
export type AssetKind = "photo" | "cutout";

/** An image the user imported. Owned by the project, not by a single chat turn. */
export type Asset = {
  id: string;
  label: string;
  kind: AssetKind;
  /** What the design agent is told, since it never sees the pixels. */
  description: string;
  dataUri: string;
  width: number;
  height: number;
  /**
   * As imported. Every enhancement runs from here rather than from the last result,
   * so re-running a mode never compounds the previous pass's artefacts, and reverting
   * is always available however many passes have run.
   */
  original: { dataUri: string; description: string; width: number; height: number; kind: AssetKind };
  enhancedWith?: EnhanceMode;
};

/** The description of an asset that travels to the design agent, without the pixels. */
export type AssetSummary = {
  id: string;
  label: string;
  kind: AssetKind;
  description: string;
  aspect: string;
  enhanced: boolean;
};

export function nextAssetId(existing: Asset[]): string {
  const highest = existing.reduce((max, asset) => {
    const n = Number(asset.id.replace(/^asset-/, ""));
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `asset-${highest + 1}`;
}

const COMMON_RATIOS: [number, number][] = [
  [1, 1],
  [4, 5],
  [3, 4],
  [2, 3],
  [9, 16],
  [4, 3],
  [3, 2],
  [16, 9],
  [2, 1],
  [21, 9],
];

/**
 * Snap to the nearest familiar ratio. "16:9" tells the model how to frame a slot;
 * "2076:974" makes it do arithmetic and get it wrong.
 */
export function aspectRatioLabel(width: number, height: number): string {
  if (!width || !height) return "1:1";

  const ratio = width / height;
  let best = COMMON_RATIOS[0]!;
  let bestDelta = Infinity;

  for (const candidate of COMMON_RATIOS) {
    const delta = Math.abs(candidate[0] / candidate[1] - ratio);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = candidate;
    }
  }

  return `${best[0]}:${best[1]}`;
}

export function summarizeAssets(assets: Asset[]): AssetSummary[] {
  return assets.map((asset) => ({
    id: asset.id,
    label: asset.label,
    kind: asset.kind,
    description: asset.description,
    aspect: aspectRatioLabel(asset.width, asset.height),
    enhanced: Boolean(asset.enhancedWith),
  }));
}
