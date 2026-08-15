"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Canvas as FabricCanvas, Rect as FabricRect } from "fabric";

import { useEditor } from "@/lib/editor/store";
import { registerLiveRoot } from "@/lib/editor/live-document";
import { useSlotFilling } from "@/components/studio/use-slot-filling";
import { frameTargets, snapAxis, type SnapGuide, type SnapTarget } from "@/lib/editor/snapping";
import {
  identityTransform,
  isIdentity,
  toSvgTransform,
  transformedBounds,
  type BaseBox,
} from "@/lib/editor/transform";
import type { Preset } from "@/lib/layout/presets";

type CanvasProps = { busy: boolean; preset: Preset };

type ProxyRect = FabricRect & { layerId: string };

export function Canvas({ busy, preset }: CanvasProps) {
  const wrapper = useRef<HTMLDivElement>(null);
  const svgHost = useRef<HTMLDivElement>(null);
  // React owns this div and nothing inside it. Fabric relocates its <canvas>
  // into a wrapper of its own, and if React owned that element it would later
  // fail to reconcile it with "insertBefore: node is not a child of this node",
  // taking the whole page down. Creating the canvas imperatively keeps the two
  // DOM owners from fighting.
  const fabricHost = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const proxies = useRef<Map<string, ProxyRect>>(new Map());
  const interactionPending = useRef(false);
  const [scale, setScale] = useState(0.5);
  const [guides, setGuides] = useState<SnapGuide[]>([]);

  const svg = useEditor((state) => state.svg);
  const layers = useEditor((state) => state.layers);
  const selection = useEditor((state) => state.selection);
  const setBaseBoxes = useEditor((state) => state.setBaseBoxes);
  const setTransforms = useEditor((state) => state.setTransforms);
  const pushHistory = useEditor((state) => state.pushHistory);
  const select = useEditor((state) => state.select);
  const nudge = useEditor((state) => state.nudge);
  const undo = useEditor((state) => state.undo);
  const redo = useEditor((state) => state.redo);

  // Zoom to fit whenever the viewport or artboard dimensions change.
  useLayoutEffect(() => {
    const element = wrapper.current;
    if (!element) return;

    const fit = () => {
      const padding = 112;
      const next = Math.min(
        (element.clientWidth - padding) / preset.width,
        (element.clientHeight - padding) / preset.height,
        1,
      );
      setScale(next > 0.05 ? next : 0.4);
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [preset.width, preset.height]);

  /**
   * Inject the document imperatively, exactly once per document.
   *
   * Rendering it through dangerouslySetInnerHTML makes React the owner of these
   * nodes, and it rewrites them on re-render. That silently destroyed everything
   * written into the document afterwards: resolved icon glyphs and generated
   * images both vanished the first time any store update landed. React owns the
   * host element; the contents are ours.
   */
  useEffect(() => {
    const host = svgHost.current;
    if (!host) return;

    host.innerHTML = svg
      ? svg.replace("<svg", `<svg style="width:100%;height:100%;display:block"`)
      : "";

    // Publish the live tree so adaptation and export read the document as it
    // actually stands, glyphs and generated pictures included.
    registerLiveRoot(host.querySelector("svg"));
    return () => registerLiveRoot(null);
  }, [svg]);

  // Resolve icon glyphs and generate art for empty photo/illustration slots.
  useSlotFilling(svgHost, svg);

  // Measure authored geometry once the document is in the DOM. getBBox only
  // works on a rendered node, so this cannot be done at parse time.
  useEffect(() => {
    const host = svgHost.current;
    if (!svg || !host) return;

    const root = host.querySelector("svg");
    if (!root) return;
    let cancelled = false;

    const measure = () => {
      if (cancelled) return;

      const boxes: Record<string, BaseBox> = {};
      for (const group of Array.from(root.children)) {
        if (!(group instanceof SVGGElement)) continue;
        const id = group.getAttribute("id");
        if (!id) continue;

        // Measure before any user transform is applied, or the box compounds.
        const existing = group.getAttribute("transform");
        group.removeAttribute("transform");
        const box = group.getBBox();
        if (existing) group.setAttribute("transform", existing);

        if (box.width > 0 && box.height > 0) {
          boxes[id] = { x: box.x, y: box.y, width: box.width, height: box.height };
        }
      }

      setBaseBoxes(boxes);
    };

    /**
     * Wait for the real typefaces before believing any text measurement.
     *
     * Until a webfont lands, text is laid out in the fallback face and its box
     * comes back a couple of units off. Nothing downstream can recover from that,
     * because the wrong box is what Fabric's handles, the snapping targets and
     * the format solver all build on: a two-unit error in a headline's height is
     * what puts it two units outside a story's safe area after adaptation.
     *
     * getBBox first, deliberately. Forcing layout is what makes the browser begin
     * loading the faces this document actually references, so fonts.ready has
     * something to wait for instead of resolving instantly on an empty queue.
     */
    root.getBBox();
    void document.fonts.ready.then(measure);

    return () => {
      cancelled = true;
    };
  }, [svg, setBaseBoxes]);

  // Write transforms and visibility onto the live nodes.
  useEffect(() => {
    const root = svgHost.current?.querySelector("svg");
    if (!root) return;

    for (const layer of layers) {
      const group = root.querySelector(`#${CSS.escape(layer.id)}`);
      if (!(group instanceof SVGGElement)) continue;

      if (layer.transform && layer.baseBox) {
        // An identity transform is a no-op, so leave the attribute off entirely.
        // Untouched layers then serialize exactly as the model authored them, and
        // the presence of a transform attribute means "a human moved this".
        if (isIdentity(layer.transform, layer.baseBox)) group.removeAttribute("transform");
        else group.setAttribute("transform", toSvgTransform(layer.transform, layer.baseBox));
      }
      group.style.display = layer.visible ? "" : "none";
    }
  }, [layers, svg]);

  const syncFromProxies = useCallback(() => {
    const next: Record<string, ReturnType<typeof identityTransform>> = {};

    for (const [id, proxy] of proxies.current) {
      const layer = useEditor.getState().layers.find((item) => item.id === id);
      if (!layer?.baseBox) continue;

      next[id] = {
        cx: (proxy.left ?? 0) / scale,
        cy: (proxy.top ?? 0) / scale,
        sx: proxy.scaleX ?? 1,
        sy: proxy.scaleY ?? 1,
        angle: proxy.angle ?? 0,
      };
    }

    if (Object.keys(next).length === 0) return;

    // The undo point is taken on the first real change of an interaction rather
    // than on mousedown, so clicking a layer without moving it does not leave a
    // history entry that undoes to an identical state.
    if (interactionPending.current) {
      interactionPending.current = false;
      pushHistory();
    }

    setTransforms(next);
  }, [scale, setTransforms, pushHistory]);

  /**
   * Signature of everything the proxies are built from.
   *
   * Keying the rebuild on layers.length alone is wrong and silently breaks the
   * editor: base boxes are measured only after the document renders, which does
   * not change the length, so the effect never re-runs and no proxy is ever
   * created. Selection, locking and visibility all feed proxy construction too.
   */
  const proxyKey = layers
    .map((layer) => `${layer.id}:${layer.baseBox ? 1 : 0}:${layer.locked ? 1 : 0}:${layer.visible ? 1 : 0}`)
    .join("|");

  // Build the shadow canvas. Fabric owns hit-testing, the transformer and
  // rotation; it never draws artwork, only invisible proxies and their handles.
  useEffect(() => {
    if (!svg || !fabricHost.current) return;
    let disposed = false;
    let canvas: FabricCanvas | null = null;
    const registry = proxies.current;
    const host = fabricHost.current;

    void (async () => {
      const { Canvas: FabricCanvasCtor, Rect } = await import("fabric");
      if (disposed || !fabricHost.current) return;

      const element = document.createElement("canvas");
      host.appendChild(element);

      canvas = new FabricCanvasCtor(element, {
        width: preset.width * scale,
        height: preset.height * scale,
        selection: true,
        preserveObjectStacking: true,
        backgroundColor: "transparent",
      });
      fabricRef.current = canvas;

      const state = useEditor.getState();
      registry.clear();

      for (const layer of state.layers) {
        if (!layer.baseBox || !layer.transform) continue;

        const proxy = new Rect({
          left: layer.transform.cx * scale,
          top: layer.transform.cy * scale,
          width: layer.baseBox.width * scale,
          height: layer.baseBox.height * scale,
          scaleX: layer.transform.sx,
          scaleY: layer.transform.sy,
          angle: layer.transform.angle,
          originX: "center",
          originY: "center",
          fill: "rgba(0,0,0,0)",
          stroke: "transparent",
          selectable: !layer.locked,
          evented: !layer.locked && layer.visible,
          hasControls: true,
          borderColor: "#2B5FFF",
          cornerColor: "#ffffff",
          cornerStrokeColor: "#2B5FFF",
          cornerSize: 9,
          cornerStyle: "circle",
          transparentCorners: false,
          borderScaleFactor: 1.6,
        }) as ProxyRect;

        proxy.layerId = layer.id;
        registry.set(layer.id, proxy);
        canvas.add(proxy);
      }

      const syncSelection = () => {
        const active = canvas?.getActiveObjects() ?? [];
        select(active.map((object) => (object as ProxyRect).layerId).filter(Boolean));
      };

      canvas.on("selection:created", syncSelection);
      canvas.on("selection:updated", syncSelection);
      canvas.on("selection:cleared", () => select([]));

      canvas.on("object:moving", (event) => {
        const target = event.target as unknown as ProxyRect | undefined;
        if (!target) return;

        const layer = useEditor.getState().layers.find((item) => item.id === target.layerId);
        if (!layer?.baseBox) {
          syncFromProxies();
          return;
        }

        const bounds = transformedBounds(
          {
            cx: (target.left ?? 0) / scale,
            cy: (target.top ?? 0) / scale,
            sx: target.scaleX ?? 1,
            sy: target.scaleY ?? 1,
            angle: target.angle ?? 0,
          },
          layer.baseBox,
        );

        const peers = (axis: "x" | "y"): SnapTarget[] =>
          useEditor
            .getState()
            .layers.filter((item) => item.id !== layer.id && item.baseBox && item.transform && item.visible)
            .flatMap((item) => {
              const peer = transformedBounds(item.transform!, item.baseBox!);
              const near = axis === "x" ? peer.left : peer.top;
              const far = axis === "x" ? peer.right : peer.bottom;
              return [
                { position: near, kind: "layer" as const },
                { position: (near + far) / 2, kind: "layer" as const },
                { position: far, kind: "layer" as const },
              ];
            });

        const x = snapAxis("x", bounds.left, bounds.right, [...frameTargets("x", preset, preset.safe), ...peers("x")], scale);
        const y = snapAxis("y", bounds.top, bounds.bottom, [...frameTargets("y", preset, preset.safe), ...peers("y")], scale);

        if (x.delta) target.set({ left: (target.left ?? 0) + x.delta * scale });
        if (y.delta) target.set({ top: (target.top ?? 0) + y.delta * scale });

        setGuides([x.guide, y.guide].filter((guide): guide is SnapGuide => guide !== null));
        syncFromProxies();
      });

      canvas.on("before:transform", () => {
        interactionPending.current = true;
      });
      canvas.on("object:scaling", () => syncFromProxies());
      canvas.on("object:rotating", () => syncFromProxies());
      canvas.on("object:modified", () => {
        setGuides([]);
        interactionPending.current = false;
        syncFromProxies();
      });
    })();

    return () => {
      disposed = true;
      setGuides([]);
      registry.clear();
      void canvas?.dispose().then(() => {
        host.replaceChildren();
      });
      fabricRef.current = null;
    };
    // Rebuilt wholesale when the document, zoom or artboard changes: the proxies
    // are derived state, so recreating them is simpler and safer than patching.
  }, [svg, scale, preset, proxyKey, syncFromProxies, select]);

  // Reflect layer-panel selection onto the canvas.
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const active = canvas.getActiveObjects().map((object) => (object as ProxyRect).layerId);
    if (sameSet(active, selection)) return;

    canvas.discardActiveObject();
    const targets = selection
      .map((id) => proxies.current.get(id))
      .filter((proxy): proxy is ProxyRect => Boolean(proxy));

    if (targets.length === 1 && targets[0]) canvas.setActiveObject(targets[0]);
    canvas.requestRenderAll();
  }, [selection]);

  // Keyboard: nudge, undo, redo, deselect.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      const step = event.shiftKey ? 10 : 1;
      const meta = event.metaKey || event.ctrlKey;

      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }

      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const move = moves[event.key];
      if (move) {
        event.preventDefault();
        nudge(move[0], move[1]);
      }
      if (event.key === "Escape") select([]);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nudge, undo, redo, select]);

  const boardWidth = preset.width * scale;
  const boardHeight = preset.height * scale;

  return (
    <div
      ref={wrapper}
      className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden bg-[#EFEEEA]"
      style={{
        backgroundImage: "radial-gradient(circle at 1px 1px, rgba(11,11,15,0.07) 1px, transparent 0)",
        backgroundSize: "22px 22px",
      }}
    >
      {!svg && (
        <div className="flex flex-col items-center gap-4">
          <div
            className="rounded-lg border border-dashed border-graphite/25 bg-white/50"
            style={{ width: boardWidth, height: boardHeight }}
          />
          <p className="absolute text-sm text-graphite">
            {busy ? "Drawing your layers..." : "Nothing on the canvas yet"}
          </p>
        </div>
      )}

      {svg && (
        <div className="relative" style={{ width: boardWidth, height: boardHeight }}>
          {/* Contents injected imperatively above; React must not manage them. */}
          <div
            ref={svgHost}
            className="absolute inset-0 bg-white shadow-[0_18px_50px_-12px_rgba(11,11,15,0.35)]"
            style={{ opacity: busy ? 0.5 : 1 }}
          />

          {guides.map((guide, index) => (
            <div
              key={`${guide.axis}-${guide.position}-${index}`}
              className="pointer-events-none absolute"
              style={
                guide.axis === "x"
                  ? {
                      left: guide.position * scale,
                      top: 0,
                      width: 1,
                      height: "100%",
                      background: guide.kind === "safe" ? "#12B981" : "#E93D9B",
                    }
                  : {
                      top: guide.position * scale,
                      left: 0,
                      height: 1,
                      width: "100%",
                      background: guide.kind === "safe" ? "#12B981" : "#E93D9B",
                    }
              }
            />
          ))}

          <div ref={fabricHost} className="absolute inset-0" />
        </div>
      )}

      <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2 rounded-full border border-mist bg-white/90 px-2.5 py-1 font-mono text-[11px] text-graphite">
        {Math.round(scale * 100)}%
      </div>
    </div>
  );
}

function sameSet(a: string[], b: string[]) {
  return a.length === b.length && a.every((value) => b.includes(value));
}
