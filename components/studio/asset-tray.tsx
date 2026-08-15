"use client";

import { useEditor } from "@/lib/editor/store";
import type { Asset } from "@/lib/assets/types";

/**
 * The imported images, shown above the composer.
 *
 * They sit here rather than inside the message that introduced them because an import
 * belongs to the project: the design agent can place asset-1 on turn five, so the user
 * has to be able to see, target and revert it on turn five too.
 */
export function AssetTray({ busy, onRevert }: { busy: boolean; onRevert: (asset: Asset) => void }) {
  const assets = useEditor((state) => state.assets);
  const activeAssetId = useEditor((state) => state.activeAssetId);
  const setActiveAsset = useEditor((state) => state.setActiveAsset);
  const removeAsset = useEditor((state) => state.removeAsset);

  if (assets.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-1 pb-2">
      {assets.map((asset) => {
        const active = asset.id === activeAssetId;

        return (
          <div
            key={asset.id}
            className={`group relative flex items-center gap-2 rounded-xl border py-1.5 pl-1.5 pr-2 transition ${
              active ? "border-signal bg-signal/[0.06]" : "border-mist bg-white hover:border-graphite/35"
            }`}
          >
            <button
              type="button"
              onClick={() => setActiveAsset(asset.id)}
              title={asset.description || asset.label}
              className="flex items-center gap-2 text-left"
            >
              {/* Checkerboard shows through a cutout, so transparency reads as transparency. */}
              <span
                className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-mist"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg,#E4E4E9 25%,transparent 25%,transparent 75%,#E4E4E9 75%),linear-gradient(45deg,#E4E4E9 25%,transparent 25%,transparent 75%,#E4E4E9 75%)",
                  backgroundSize: "8px 8px",
                  backgroundPosition: "0 0, 4px 4px",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a data URI has nothing to optimise */}
                <img src={asset.dataUri} alt="" className="h-full w-full object-cover" />
              </span>

              <span className="min-w-0">
                <span className="block max-w-[132px] truncate text-[13px] leading-tight text-ink">
                  {asset.label}
                </span>
                <span className="block font-mono text-[10px] leading-tight text-graphite/70">
                  {asset.id}
                  {asset.enhancedWith ? ` · ${asset.enhancedWith}` : ""}
                </span>
              </span>
            </button>

            {asset.enhancedWith && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onRevert(asset)}
                title="Back to the image you imported"
                className="rounded p-1 text-graphite/50 transition enabled:hover:text-ink disabled:opacity-30"
              >
                <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M2.5 7a4.5 4.5 0 1 0 1.4-3.3M2.5 2.5V5H5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}

            <button
              type="button"
              disabled={busy}
              onClick={() => removeAsset(asset.id)}
              title="Remove"
              className="rounded p-1 text-graphite/50 transition enabled:hover:text-magenta disabled:opacity-30"
            >
              <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M3.5 3.5 10.5 10.5M10.5 3.5 3.5 10.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
