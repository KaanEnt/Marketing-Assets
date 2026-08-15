"use client";

import { useEffect, useState } from "react";

import { useEditor } from "@/lib/editor/store";
import { liveSvg } from "@/lib/editor/live-document";
import { issueSummary } from "@/lib/ai/prompts/refine";
import { adaptDocument, type AdaptCandidate, type LayerState } from "@/lib/layout/adapt";
import { PRESETS, PRESET_IDS, type Preset, type PresetFamily } from "@/lib/layout/presets";

type AdaptPanelProps = {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onApply: (candidate: AdaptCandidate) => void;
  onRefine: (candidate: AdaptCandidate) => void;
};

/**
 * Which formats are worth offering from where.
 *
 * A flyer reflowed into a logo frame is not a hard case, it is a meaningless one,
 * and a grid full of meaningless cards makes the useful ones harder to find.
 */
const TARGETS: Record<PresetFamily, PresetFamily[]> = {
  social: ["social", "print"],
  print: ["print", "social"],
  logo: ["logo"],
};

const FAMILY_LABEL: Record<PresetFamily, string> = {
  social: "Social",
  print: "Print",
  logo: "Logo",
};

const THUMB = { width: 210, height: 168 };

/**
 * Mounting the sheet only while open is what keeps its state honest: each opening
 * gets fresh useState values instead of an effect racing to reset stale ones, and
 * the in-flight solve is cancelled by unmount rather than by a flag.
 */
export function AdaptPanel({ open, ...rest }: AdaptPanelProps) {
  return open ? <AdaptSheet {...rest} /> : null;
}

type Plan = {
  source: string | null;
  from: Preset;
  layers: LayerState[];
  targets: Preset[];
};

function readPlan(): Plan {
  // Read the document once, at open. The panel shows what was on the artboard
  // when it was opened, so a stray nudge behind the backdrop cannot restart a
  // dozen adaptations mid-scroll.
  const state = useEditor.getState();
  const from = PRESETS[state.presetId];

  const layers: LayerState[] = state.layers
    .filter((layer) => layer.baseBox && layer.transform)
    .map((layer) => ({
      id: layer.id,
      name: layer.name,
      h: layer.h,
      v: layer.v,
      baseBox: layer.baseBox!,
      transform: layer.transform!,
    }));

  const families = TARGETS[from.family];
  const targets = PRESET_IDS.map((id) => PRESETS[id]).filter(
    (preset) => preset.id !== from.id && families.includes(preset.family),
  );

  return { source: liveSvg() ?? state.svg, from, layers, targets };
}

function AdaptSheet({ busy, onClose, onApply, onRefine }: Omit<AdaptPanelProps, "open">) {
  const [plan] = useState(readPlan);
  const [candidates, setCandidates] = useState<AdaptCandidate[]>([]);
  const [remaining, setRemaining] = useState(() =>
    plan.source && plan.layers.length > 0 ? plan.targets.length : 0,
  );

  useEffect(() => {
    if (!plan.source || plan.layers.length === 0) return;
    let cancelled = false;

    void (async () => {
      for (const target of plan.targets) {
        // Yield a frame between formats. Each adaptation parses and reserializes a
        // document that may carry a megabyte of base64 photography, and doing all
        // of them in one tick locks the panel up before it has painted anything.
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (cancelled) return;

        const candidate = adaptDocument(plan.source!, plan.layers, plan.from, target);
        setRemaining((count) => count - 1);
        if (candidate) setCandidates((current) => [...current, candidate]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [plan]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    // Captured, because the canvas binds Escape on window to clear the selection.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const grouped = (["social", "print", "logo"] as PresetFamily[])
    .map((family) => ({ family, items: candidates.filter((item) => item.preset.family === family) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/25 backdrop-blur-[2px]"
      />

      <div className="relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-mist bg-paper shadow-[0_32px_80px_-20px_rgba(11,11,15,0.45)]">
        <header className="flex shrink-0 items-start justify-between gap-6 border-b border-mist px-6 py-5">
          <div>
            <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-ink">
              Adapt to another format
            </h2>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-graphite">
              Every layer is re-solved from its anchoring constraints, then checked against
              the target&apos;s safe area and type floor. Deterministic and local: nothing is
              sent to the model unless you ask for a rework.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1.5 -mt-1 shrink-0 rounded-lg p-2 text-graphite transition hover:bg-ink/[0.06] hover:text-ink"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {grouped.map((group) => (
            <section key={group.family} className="mb-7 last:mb-0">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-graphite">
                {FAMILY_LABEL[group.family]}
              </h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4">
                {group.items.map((candidate) => (
                  <FormatCard
                    key={candidate.preset.id}
                    candidate={candidate}
                    busy={busy}
                    onApply={() => onApply(candidate)}
                    onRefine={() => onRefine(candidate)}
                  />
                ))}
              </div>
            </section>
          ))}

          {remaining > 0 && (
            <p className="flex items-center gap-2 py-2 text-[13px] text-graphite">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal" />
              Solving {remaining} more format{remaining === 1 ? "" : "s"}...
            </p>
          )}

          {remaining === 0 && candidates.length === 0 && (
            <p className="py-8 text-center text-sm text-graphite">
              Nothing to adapt yet. Generate a design first.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function FormatCard({
  candidate,
  busy,
  onApply,
  onRefine,
}: {
  candidate: AdaptCandidate;
  busy: boolean;
  onApply: () => void;
  onRefine: () => void;
}) {
  const { preset, issues, preview } = candidate;
  const unresolved = issues.filter((issue) => !issue.fixed);
  const board = fit(preset, THUMB);

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-mist bg-white transition hover:border-graphite/35">
      <button
        type="button"
        onClick={onApply}
        title={`Open in ${preset.label}`}
        className="relative flex items-center justify-center bg-[#EFEEEA] p-3"
        style={{
          height: THUMB.height,
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(11,11,15,0.07) 1px, transparent 0)",
          backgroundSize: "16px 16px",
        }}
      >
        {/* Static markup with namespaced ids. React owns these nodes and nothing
            mutates them afterwards, unlike the artboard. */}
        <span
          className="block bg-white shadow-[0_6px_18px_-6px_rgba(11,11,15,0.4)] [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
          style={{ width: board.width, height: board.height }}
          dangerouslySetInnerHTML={{ __html: preview }}
        />

        <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:bg-ink/45 group-hover:opacity-100">
          <span className="rounded-full bg-paper px-3 py-1.5 text-[12px] font-medium text-ink">
            Open this format
          </span>
        </span>
      </button>

      <div className="flex flex-col gap-2 border-t border-mist px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-medium text-ink">{preset.label}</span>
          <span className="shrink-0 font-mono text-[10px] text-graphite/70">
            {preset.width}×{preset.height}
          </span>
        </div>

        <div
          className="flex items-center gap-1.5 text-[11px]"
          title={issues.map((issue) => issue.message).join("\n") || undefined}
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              unresolved.length > 0 ? "bg-amber" : issues.length > 0 ? "bg-signal" : "bg-vector"
            }`}
          />
          <span className={unresolved.length > 0 ? "text-amber" : "text-graphite"}>
            {issueSummary(issues)}
          </span>
        </div>

        {unresolved.length > 0 && (
          <button
            type="button"
            onClick={onRefine}
            disabled={busy}
            className="rounded-lg border border-mist px-2.5 py-1.5 text-[12px] font-medium text-ink transition enabled:hover:border-graphite/40 enabled:hover:bg-ink/[0.04] disabled:opacity-40"
          >
            Rework with AI
          </button>
        )}
      </div>
    </div>
  );
}

/** Artboard size that shows the format's true proportions inside the tile. */
function fit(preset: Preset, box: { width: number; height: number }) {
  const k = Math.min((box.width - 24) / preset.width, (box.height - 24) / preset.height);
  return { width: Math.round(preset.width * k), height: Math.round(preset.height * k) };
}
