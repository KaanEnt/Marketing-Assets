"use client";

import { useEffect, useRef, type RefObject } from "react";

import { useEditor } from "@/lib/editor/store";
import { resolveIcons } from "@/lib/svg/icons";
import { extractPalette, fillSlot, findSlots } from "@/lib/svg/slots";

/**
 * Three pictures is a composition; eight is a model that lost the plot and a
 * dollar of generation nobody asked for. A marketing asset that genuinely needs
 * more than three distinct generated images is rare enough to be worth the
 * manual pass.
 */
const MAX_GENERATED_SLOTS = 3;

/**
 * Resolve icon placeholders and fill photo/illustration slots once a document
 * lands.
 *
 * The DOM is treated as the source of truth for document content here rather
 * than the store's SVG string: pushing filled images back through the store
 * would re-set innerHTML, which destroys the nodes Fabric's proxies are measured
 * against and drops every user transform.
 */
export function useSlotFilling(host: RefObject<HTMLDivElement | null>, svg: string | null) {
  const setSlotState = useEditor((state) => state.setSlotState);
  const setIllustrationStyle = useEditor((state) => state.setIllustrationStyle);
  const assets = useEditor((state) => state.assets);
  const handled = useRef<string | null>(null);
  // Keyed by slot id, holding the exact picture written into it, so an enhancement
  // repaints its slot while an unchanged asset never touches the DOM again.
  const painted = useRef<Map<string, string>>(new Map());
  const paintedFor = useRef<string | null>(null);

  // Imported images are already in hand, so they land immediately and separately from
  // generation. Running them through the generation loop would make the user's own
  // photograph wait behind model calls that have nothing to do with it.
  useEffect(() => {
    const root = host.current?.querySelector("svg");
    if (!svg || !root) return;

    if (paintedFor.current !== svg) {
      painted.current.clear();
      paintedFor.current = svg;
    }

    for (const slot of findSlots(root)) {
      if (!slot.assetId) continue;

      const asset = assets.find((item) => item.id === slot.assetId);
      if (!asset) {
        setSlotState(slot.id, "failed");
        continue;
      }

      if (painted.current.get(slot.id) === asset.dataUri) continue;

      // A cutout is transparent art whatever slot kind the model chose for it, and
      // clipping one to a rectangle would saw the subject off at the shoulders.
      const placement = asset.kind === "cutout" ? { ...slot, kind: "illustration" as const } : slot;

      const ok = fillSlot(root, placement, asset.dataUri);
      if (ok) painted.current.set(slot.id, asset.dataUri);
      setSlotState(slot.id, ok ? "filled" : "failed");
    }
  }, [svg, assets, host, setSlotState]);

  useEffect(() => {
    const root = host.current?.querySelector("svg");
    if (!svg || !root) return;

    // Each document is processed once; re-renders must not re-trigger generation.
    if (handled.current === svg) return;
    handled.current = svg;

    resolveIcons(root);

    // An asset-bound slot already has its picture and must never be regenerated.
    const wanted = findSlots(root).filter((slot) => !slot.filled && !slot.assetId && slot.prompt);
    if (wanted.length === 0) return;

    // Each fill is a flat charge, and nothing in the contract stops a document
    // declaring eight of them. The cap is on the client because this is where the
    // count is known; the route is limited separately, since a client-side cap is
    // a courtesy to honest callers rather than a control.
    //
    // Biggest first, so a document over the cap spends its budget on the slots
    // that dominate the composition rather than on whichever came first in
    // document order.
    const slots = [...wanted]
      .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height)
      .slice(0, MAX_GENERATED_SLOTS);

    for (const skipped of wanted.filter((slot) => !slots.includes(slot))) {
      setSlotState(skipped.id, "failed");
    }
    if (slots.length < wanted.length) {
      console.info(
        `[slots] filling ${slots.length} of ${wanted.length}; the rest are over the per-document cap`,
      );
    }

    const palette = extractPalette(root);
    const controller = new AbortController();

    for (const slot of slots) setSlotState(slot.id, "pending");

    void (async () => {
      for (const slot of slots) {
        if (controller.signal.aborted) return;
        setSlotState(slot.id, "generating");

        // Style is locked by the first illustration and reused verbatim after.
        const existingStyle = useEditor.getState().illustrationStyle;
        const style =
          slot.kind === "illustration"
            ? (existingStyle ??
              `Consistent flat vector style across this set: even line weight, simple shading, palette ${palette.join(", ")}.`)
            : undefined;

        try {
          const response = await fetch("/api/image", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              prompt: slot.prompt,
              kind: slot.kind,
              palette,
              style,
              aspect: slot.box.width / slot.box.height,
            }),
            signal: controller.signal,
          });

          if (!response.ok) {
            setSlotState(slot.id, "failed");
            continue;
          }

          const { dataUri } = (await response.json()) as { dataUri?: string };
          const live = host.current?.querySelector("svg");
          if (!dataUri || !live) {
            setSlotState(slot.id, "failed");
            continue;
          }

          // Re-read the slot: the user may have moved it while this was in flight.
          const current = findSlots(live).find((item) => item.id === slot.id) ?? slot;
          setSlotState(slot.id, fillSlot(live, current, dataUri) ? "filled" : "failed");

          if (slot.kind === "illustration" && style && !existingStyle) {
            setIllustrationStyle(style);
          }
        } catch {
          if (!controller.signal.aborted) setSlotState(slot.id, "failed");
        }
      }
    })();

    return () => controller.abort();
  }, [svg, host, setSlotState, setIllustrationStyle]);
}
