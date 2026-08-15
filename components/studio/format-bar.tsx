"use client";

import type { Preset } from "@/lib/layout/presets";

export function FormatBar({
  preset,
  disabled,
  onAdapt,
}: {
  preset: Preset;
  disabled: boolean;
  onAdapt: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 rounded-full border border-mist py-1 pl-3 pr-3.5">
        <span className="text-sm font-medium text-graphite">{preset.label}</span>
        <span className="font-mono text-[11px] text-graphite/60">
          {preset.width}×{preset.height}
        </span>
      </div>

      <button
        type="button"
        onClick={onAdapt}
        disabled={disabled}
        title="Re-solve this design for other formats"
        className="flex items-center gap-1.5 rounded-full border border-mist px-3 py-1.5 text-sm font-medium text-ink transition enabled:hover:border-graphite/40 enabled:hover:bg-ink/[0.04] disabled:opacity-35"
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
          <rect x="1.5" y="3" width="7" height="10" rx="1.2" />
          <rect x="10.5" y="5.5" width="4" height="5" rx="1" />
        </svg>
        Adapt
      </button>
    </div>
  );
}
