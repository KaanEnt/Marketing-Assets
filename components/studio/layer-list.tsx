"use client";

import type { LayerInfo, LayerKind } from "@/lib/svg/layers";

// Green marks editable vector, amber marks generated raster. The same grammar the
// deck uses, so the distinction reads without a legend.
const KIND_STYLE: Record<LayerKind, { label: string; dot: string }> = {
  vector: { label: "vector", dot: "bg-vector" },
  text: { label: "text", dot: "bg-signal" },
  image: { label: "photo", dot: "bg-amber" },
  illustration: { label: "art", dot: "bg-amber" },
};

type LayerListProps = {
  layers: LayerInfo[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  busy: boolean;
};

export function LayerList({ layers, selected, onSelect, busy }: LayerListProps) {
  return (
    <aside className="flex w-[276px] shrink-0 flex-col border-l border-mist">
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
          const isSelected = layer.id === selected;

          return (
            <button
              key={layer.id}
              type="button"
              onMouseEnter={() => onSelect(layer.id)}
              onClick={() => onSelect(isSelected ? null : layer.id)}
              className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                isSelected ? "bg-signal/10" : "hover:bg-ink/[0.04]"
              }`}
            >
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm ${isSelected ? "text-signal" : "text-ink"}`}>
                  {layer.name}
                </span>
                <span className="block truncate font-mono text-[10px] text-graphite/60">
                  {style.label} · {layer.h}/{layer.v}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {layers.length > 0 && (
        <p className="border-t border-mist px-4 py-3 text-[11px] leading-relaxed text-graphite/70">
          Each row is an independent layer with its own anchoring constraints. Hover to
          highlight it on the canvas.
        </p>
      )}
    </aside>
  );
}
