"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { Preset } from "@/lib/layout/presets";

type CanvasProps = {
  svg: string | null;
  busy: boolean;
  selected: string | null;
  preset: Preset;
};

export function Canvas({ svg, busy, selected, preset }: CanvasProps) {
  const frame = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  // Zoom to fit whenever the viewport or the artboard dimensions change.
  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;

    const fit = () => {
      const padding = 96;
      const available = {
        width: element.clientWidth - padding,
        height: element.clientHeight - padding,
      };
      const next = Math.min(available.width / preset.width, available.height / preset.height, 1);
      setScale(next > 0 ? next : 0.4);
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [preset.width, preset.height]);

  // Selection highlight is drawn by outlining the real node, so it tracks the
  // artwork exactly rather than needing a parallel geometry model.
  useEffect(() => {
    const root = holder.current?.querySelector("svg");
    if (!root) return;

    for (const group of Array.from(root.children)) {
      if (!(group instanceof SVGGElement)) continue;
      const isSelected = group.getAttribute("id") === selected;
      group.style.outline = isSelected ? "2px solid #2B5FFF" : "";
      group.style.outlineOffset = isSelected ? "3px" : "";
    }
  }, [selected, svg]);

  return (
    <div
      ref={frame}
      className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-[#EFEEEA]"
      style={{
        backgroundImage:
          "radial-gradient(circle at 1px 1px, rgba(11,11,15,0.07) 1px, transparent 0)",
        backgroundSize: "22px 22px",
      }}
    >
      {!svg && (
        <div className="flex flex-col items-center gap-4 text-center">
          <div
            className="rounded-lg border border-dashed border-graphite/25 bg-white/50"
            style={{ width: preset.width * scale, height: preset.height * scale }}
          />
          <p className="absolute text-sm text-graphite">
            {busy ? "Drawing your layers..." : "Nothing on the canvas yet"}
          </p>
        </div>
      )}

      {svg && (
        <div
          ref={holder}
          className="bg-white shadow-[0_18px_50px_-12px_rgba(11,11,15,0.35)] transition-opacity"
          style={{
            width: preset.width * scale,
            height: preset.height * scale,
            opacity: busy ? 0.55 : 1,
          }}
          dangerouslySetInnerHTML={{
            // Already sanitized in lib/svg/layers.ts before it reached this component.
            __html: svg.replace(
              "<svg",
              `<svg style="width:100%;height:100%;display:block"`,
            ),
          }}
        />
      )}

      <div className="pointer-events-none absolute bottom-4 right-4 rounded-full border border-mist bg-white/90 px-2.5 py-1 font-mono text-[11px] text-graphite">
        {Math.round(scale * 100)}%
      </div>
    </div>
  );
}
