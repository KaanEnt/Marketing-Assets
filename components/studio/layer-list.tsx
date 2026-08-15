"use client";

import { useEditor } from "@/lib/editor/store";
import { isIdentity } from "@/lib/editor/transform";
import type { LayerKind } from "@/lib/svg/layers";

// Green marks editable vector, amber marks generated raster. Same grammar the
// deck uses, so the distinction reads without a legend.
const KIND_STYLE: Record<LayerKind, { label: string; dot: string }> = {
  vector: { label: "vector", dot: "bg-vector" },
  text: { label: "text", dot: "bg-signal" },
  image: { label: "photo", dot: "bg-amber" },
  illustration: { label: "art", dot: "bg-amber" },
};

const SLOT_LABEL: Record<string, string> = {
  pending: "queued",
  generating: "generating",
  failed: "failed",
};

export function LayerList({ busy }: { busy: boolean }) {
  const layers = useEditor((state) => state.layers);
  const slotState = useEditor((state) => state.slotState);
  const selection = useEditor((state) => state.selection);
  const select = useEditor((state) => state.select);
  const toggleVisible = useEditor((state) => state.toggleVisible);
  const toggleLock = useEditor((state) => state.toggleLock);

  return (
    <aside className="flex w-[288px] shrink-0 flex-col border-l border-mist">
      <div className="flex items-center justify-between border-b border-mist px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-graphite">Layers</h2>
        {layers.length > 0 && (
          <span className="font-mono text-[11px] text-graphite/70">{layers.length}</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {layers.length === 0 && (
          <p className="px-2 py-3 text-sm text-graphite/70">
            {busy ? "Waiting for the document..." : "Layers appear once a design is generated."}
          </p>
        )}

        {/* Reversed: topmost in z-order sits at the top of the panel, as in Figma. */}
        {[...layers].reverse().map((layer) => {
          const style = KIND_STYLE[layer.kind];
          const isSelected = selection.includes(layer.id);
          const moved = layer.transform && layer.baseBox && !isIdentity(layer.transform, layer.baseBox);
          const slotStatus = slotState[layer.id];

          return (
            <div
              key={layer.id}
              className={`group flex items-center gap-1 rounded-lg pr-1 transition ${
                isSelected ? "bg-signal/10" : "hover:bg-ink/[0.04]"
              }`}
            >
              <button
                type="button"
                onClick={() => select(isSelected ? [] : [layer.id])}
                className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-left"
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
                <span className="min-w-0 flex-1">
                  <span
                    className={`flex items-center gap-1.5 truncate text-sm ${
                      isSelected ? "text-signal" : layer.visible ? "text-ink" : "text-graphite/45"
                    }`}
                  >
                    {layer.name}
                    {moved && (
                      <span
                        title="Moved by hand. This survives regeneration."
                        className="h-1 w-1 shrink-0 rounded-full bg-magenta"
                      />
                    )}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-graphite/60">
                    {slotStatus && slotStatus !== "filled" ? (
                      <span className={slotStatus === "failed" ? "text-magenta" : "text-amber"}>
                        {SLOT_LABEL[slotStatus]}
                        {slotStatus === "generating" && "..."}
                      </span>
                    ) : (
                      <>
                        {style.label} · {layer.h}/{layer.v}
                      </>
                    )}
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => toggleLock(layer.id)}
                title={layer.locked ? "Unlock" : "Lock"}
                className={`shrink-0 rounded p-1.5 transition ${
                  layer.locked ? "text-ink" : "text-graphite/0 group-hover:text-graphite/60 hover:!text-ink"
                }`}
              >
                <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <rect x="3" y="6.5" width="8" height="5.5" rx="1.2" />
                  <path d={layer.locked ? "M5 6.5V4.5a2 2 0 0 1 4 0v2" : "M5 6.5V4.5a2 2 0 0 1 3.6-1.2"} />
                </svg>
              </button>

              <button
                type="button"
                onClick={() => toggleVisible(layer.id)}
                title={layer.visible ? "Hide" : "Show"}
                className={`shrink-0 rounded p-1.5 transition ${
                  layer.visible ? "text-graphite/0 group-hover:text-graphite/60 hover:!text-ink" : "text-ink"
                }`}
              >
                <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <path d="M1 7s2.2-3.6 6-3.6S13 7 13 7s-2.2 3.6-6 3.6S1 7 1 7Z" />
                  <circle cx="7" cy="7" r="1.6" />
                  {!layer.visible && <path d="M2 12 12 2" />}
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {layers.length > 0 && (
        <p className="border-t border-mist px-4 py-3 text-[11px] leading-relaxed text-graphite/70">
          Drag, resize and rotate on the canvas. Arrow keys nudge, shift for ten units.
          A pink dot marks a layer you moved by hand.
        </p>
      )}
    </aside>
  );
}
