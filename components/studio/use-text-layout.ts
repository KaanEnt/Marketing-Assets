"use client";

import { useEffect, useRef, type RefObject } from "react";

import { useEditor } from "@/lib/editor/store";
import { typeScale } from "@/lib/ai/prompts/house-style";
import { createMeasurer, fontsReady } from "@/lib/text/measure";
import { effectiveRun, findRuns, runElement, layoutRun, writeRun, type TextRun } from "@/lib/text/runs";
import type { Preset } from "@/lib/layout/presets";

/**
 * Own the copy in the document: read it once, re-lay it out when it changes.
 *
 * Two effects rather than one, because they answer to different things. The first
 * records every block as the model authored it, once per document. The second
 * re-renders only what the user has changed, which can happen many times against
 * that one recording.
 *
 * Laying out from the recording rather than from the DOM is what makes repeated
 * edits safe. Reading the current nodes back would mean reading a size that
 * shrink-to-fit already reduced, and each pass would shrink it again.
 */
export function useTextLayout(
  host: RefObject<HTMLDivElement | null>,
  svg: string | null,
  preset: Preset,
) {
  const runs = useEditor((state) => state.runs);
  const textEdits = useEditor((state) => state.textEdits);
  const setRuns = useEditor((state) => state.setRuns);
  const applied = useRef<Set<string>>(new Set());

  useEffect(() => {
    const root = host.current?.querySelector("svg");
    if (!svg || !root) return;
    let cancelled = false;
    applied.current = new Set();

    void (async () => {
      // Column widths come from getBBox, so the faces have to be the real ones or
      // every column is measured against fallback metrics.
      await fontsReady();
      if (cancelled) return;

      const found: Record<string, TextRun> = {};
      for (const group of Array.from(root.children)) {
        if (!(group instanceof SVGGElement)) continue;
        const id = group.getAttribute("id");
        if (!id) continue;

        for (const run of findRuns(group, id)) found[run.key] = run;
      }

      setRuns(found);
    })();

    return () => {
      cancelled = true;
    };
  }, [svg, host, setRuns]);

  useEffect(() => {
    const root = host.current?.querySelector("svg");
    if (!root || Object.keys(runs).length === 0) return;

    const { measure, dispose } = createMeasurer();
    const floor = typeScale(preset).floor;
    const seen = new Set<string>();

    try {
      for (const [key, edit] of Object.entries(textEdits)) {
        const run = runs[key];
        const element = elementFor(root, run);
        if (!run || !element) continue;

        seen.add(key);
        layoutRun(element, effectiveRun(run, edit), measure, floor);
      }

      // An edit that has been undone leaves its rendering behind, so anything
      // laid out last pass and not this one goes back to what was authored.
      for (const key of applied.current) {
        if (seen.has(key)) continue;
        const run = runs[key];
        const element = elementFor(root, run);
        if (!run || !element) continue;

        writeRun(element, run.lines, run.style, run.x, run.baseline);
      }
    } finally {
      dispose();
    }

    applied.current = seen;
  }, [runs, textEdits, host, preset]);
}

function elementFor(root: SVGSVGElement, run: TextRun | undefined): SVGTextElement | null {
  if (!run) return null;
  const group = root.querySelector(`#${CSS.escape(run.layerId)}`);
  return group instanceof SVGGElement ? runElement(group, run.index) : null;
}
