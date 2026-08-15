import type { Asset } from "@/lib/assets/types";
import { DEFAULT_PRESET } from "@/lib/layout/presets";

const BRIEF_KEY = "brief";

export type Brief = {
  message: string;
  presetId: string;
  assets: Asset[];
};

export type StoreBriefResult = { ok: true } | { ok: false; reason: "too-large" | "unavailable" };

/**
 * Carry the opening brief across the landing-to-studio navigation.
 *
 * There is no database and no auth, so session storage is the handoff. Imported images
 * are downscaled before they get here, but a large enough set still blows the ~5MB
 * origin quota, and losing the whole brief over an attachment would be a worse failure
 * than losing the attachment. So the text is written first and never sacrificed.
 */
export function storeBrief(brief: Brief): StoreBriefResult {
  try {
    sessionStorage.setItem(BRIEF_KEY, JSON.stringify(brief));
    return { ok: true };
  } catch {
    try {
      sessionStorage.setItem(BRIEF_KEY, JSON.stringify({ ...brief, assets: [] }));
      return { ok: false, reason: "too-large" };
    } catch {
      return { ok: false, reason: "unavailable" };
    }
  }
}

/** Left in place after reading, so a refresh rebuilds the design rather than losing it. */
export function readBrief(): Brief | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(BRIEF_KEY);
  } catch {
    return null;
  }

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<Brief>;
    if (typeof parsed.message !== "string" || !parsed.message.trim()) return null;

    return {
      message: parsed.message,
      presetId: typeof parsed.presetId === "string" ? parsed.presetId : DEFAULT_PRESET,
      assets: Array.isArray(parsed.assets) ? parsed.assets : [],
    };
  } catch {
    return null;
  }
}
