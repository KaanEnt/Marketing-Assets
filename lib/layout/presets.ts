export type PresetFamily = "social" | "print" | "logo";

export type Inset = { top: number; right: number; bottom: number; left: number };

export type Preset = {
  id: PresetId;
  label: string;
  family: PresetFamily;
  /** viewBox width in design units. */
  width: number;
  /** viewBox height in design units. */
  height: number;
  /** Nothing load-bearing may sit outside this. In design units. */
  safe: Inset;
  /** Trim allowance for print. Zero for screen formats. */
  bleed: number;
  /** Raster export multipliers offered for this preset. */
  exportScales: number[];
  /** Shown to the model so it understands the medium, not just the numbers. */
  note?: string;
};

export const PRESET_IDS = [
  "ig-square",
  "ig-portrait",
  "ig-story",
  "li-post",
  "li-square",
  "x-post",
  "fb-feed",
  "yt-thumb",
  "us-letter",
  "a4",
  "logo-square",
  "logo-horizontal",
] as const;

export type PresetId = (typeof PRESET_IDS)[number];

const uniform = (value: number): Inset => ({
  top: value,
  right: value,
  bottom: value,
  left: value,
});

// Print presets deliberately keep their viewBox in 100-DPI design units rather than
// 300-DPI pixels. The model reasons far better about a 850x1100 frame than a
// 2550x3300 one, and export applies the 3x scale factor instead.
export const PRESETS: Record<PresetId, Preset> = {
  "ig-square": {
    id: "ig-square",
    label: "Instagram Post",
    family: "social",
    width: 1080,
    height: 1080,
    safe: uniform(64),
    bleed: 0,
    exportScales: [1, 2],
  },
  "ig-portrait": {
    id: "ig-portrait",
    label: "Instagram Portrait",
    family: "social",
    width: 1080,
    height: 1350,
    safe: { top: 80, right: 64, bottom: 80, left: 64 },
    bleed: 0,
    exportScales: [1, 2],
  },
  "ig-story": {
    id: "ig-story",
    label: "Instagram Story",
    family: "social",
    width: 1080,
    height: 1920,
    safe: { top: 250, right: 64, bottom: 320, left: 64 },
    bleed: 0,
    exportScales: [1, 2],
    note: "Platform UI covers the top ~13% and bottom ~17%. Keep text and logos clear of both.",
  },
  "li-post": {
    id: "li-post",
    label: "LinkedIn Post",
    family: "social",
    width: 1200,
    height: 627,
    safe: uniform(60),
    bleed: 0,
    exportScales: [1, 2],
    note: "Wide and short. Headlines run to 2 lines maximum here.",
  },
  "li-square": {
    id: "li-square",
    label: "LinkedIn Square",
    family: "social",
    width: 1200,
    height: 1200,
    safe: uniform(72),
    bleed: 0,
    exportScales: [1, 2],
  },
  "x-post": {
    id: "x-post",
    label: "X Post",
    family: "social",
    width: 1600,
    height: 900,
    safe: uniform(80),
    bleed: 0,
    exportScales: [1, 2],
  },
  "fb-feed": {
    id: "fb-feed",
    label: "Facebook Feed",
    family: "social",
    width: 1200,
    height: 630,
    safe: uniform(60),
    bleed: 0,
    exportScales: [1, 2],
  },
  "yt-thumb": {
    id: "yt-thumb",
    label: "YouTube Thumbnail",
    family: "social",
    width: 1280,
    height: 720,
    safe: uniform(64),
    bleed: 0,
    exportScales: [1, 2],
    note: "The duration badge covers the bottom-right ~14% x ~10%. Keep it clear.",
  },
  "us-letter": {
    id: "us-letter",
    label: "US Letter",
    family: "print",
    width: 850,
    height: 1100,
    safe: uniform(64),
    bleed: 12,
    exportScales: [3],
    note: "Print at 300 DPI. Background fills must extend into the bleed.",
  },
  a4: {
    id: "a4",
    label: "A4",
    family: "print",
    width: 827,
    height: 1169,
    safe: uniform(64),
    bleed: 12,
    exportScales: [3],
    note: "Print at 300 DPI. Background fills must extend into the bleed.",
  },
  "logo-square": {
    id: "logo-square",
    label: "Logo (square)",
    family: "logo",
    width: 1000,
    height: 1000,
    safe: uniform(100),
    bleed: 0,
    exportScales: [0.512, 1.024, 2.048],
    note: "Transparent background. The safe inset is the mark's clear space.",
  },
  "logo-horizontal": {
    id: "logo-horizontal",
    label: "Logo (horizontal lockup)",
    family: "logo",
    width: 1600,
    height: 500,
    safe: uniform(60),
    bleed: 0,
    exportScales: [0.512, 1.024, 2.048],
    note: "Transparent background. Mark left, wordmark right.",
  },
};

export const DEFAULT_PRESET: PresetId = "ig-portrait";

export function getPreset(id: string): Preset | null {
  return isPresetId(id) ? PRESETS[id] : null;
}

export function isPresetId(id: string): id is PresetId {
  return (PRESET_IDS as readonly string[]).includes(id);
}

export function viewBox(preset: Preset): string {
  return `0 0 ${preset.width} ${preset.height}`;
}

/** Inner box a layer must stay within to clear the safe area. */
export function safeBox(preset: Preset) {
  return {
    x: preset.safe.left,
    y: preset.safe.top,
    width: preset.width - preset.safe.left - preset.safe.right,
    height: preset.height - preset.safe.top - preset.safe.bottom,
  };
}

export function presetsByFamily(family: PresetFamily): Preset[] {
  return PRESET_IDS.map((id) => PRESETS[id]).filter((preset) => preset.family === family);
}
