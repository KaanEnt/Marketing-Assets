"use client";

import { useEffect, useRef, type RefObject } from "react";

import { useEditor } from "@/lib/editor/store";
import { resolveIcons } from "@/lib/svg/icons";
import { extractPalette, fillSlot, findSlots } from "@/lib/svg/slots";

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
  const handled = useRef<string | null>(null);

  useEffect(() => {
    const root = host.current?.querySelector("svg");
    if (!svg || !root) return;

    // Each document is processed once; re-renders must not re-trigger generation.
    if (handled.current === svg) return;
    handled.current = svg;

    resolveIcons(root);

    const slots = findSlots(root).filter((slot) => !slot.filled && slot.prompt);
    if (slots.length === 0) return;

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
