"use client";

import { useState } from "react";

import { useEditor } from "@/lib/editor/store";
import { effectiveRun, type Anchor, type TextRun } from "@/lib/text/runs";
import { FONT_NAMES, getFont, nearestWeight } from "@/lib/text/fonts";

const ALIGNMENTS: { value: Anchor; label: string; path: string }[] = [
  { value: "start", label: "Align left", path: "M2 3h12M2 7h8M2 11h10" },
  { value: "middle", label: "Align centre", path: "M2 3h12M4 7h8M3 11h10" },
  { value: "end", label: "Align right", path: "M2 3h12M6 7h8M4 11h10" },
];

export function TextProperties() {
  const selection = useEditor((state) => state.selection);
  const runs = useEditor((state) => state.runs);
  const textEdits = useEditor((state) => state.textEdits);
  const setTextEdit = useEditor((state) => state.setTextEdit);
  const setEditingRun = useEditor((state) => state.setEditingRun);
  const layout = useEditor((state) => state.layout);
  const [chosen, setChosen] = useState(0);

  const layerId = selection[0];
  const layerRuns = Object.values(runs)
    .filter((run) => run.layerId === layerId)
    .sort((a, b) => a.index - b.index);

  if (selection.length !== 1 || layerRuns.length === 0) return null;

  const index = Math.min(chosen, layerRuns.length - 1);
  const authored = layerRuns[index] as TextRun;
  const run = effectiveRun(authored, textEdits[authored.key]);
  const patch = (next: Parameters<typeof setTextEdit>[1]) => setTextEdit(authored.key, next);
  const weights = getFont(run.style.family)?.weights ?? [400, 700];
  const rendered = layout[authored.key];
  // Shrink-to-fit routinely halves a headline, and a panel reporting only the
  // requested size describes something the user cannot see on the artboard.
  const shrunk = rendered && Math.abs(rendered.size - run.style.size) > 0.5;

  return (
    <div className="shrink-0 border-t border-mist">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-graphite">Type</h2>
        <button
          type="button"
          onClick={() => setEditingRun(authored.key)}
          className="rounded-lg border border-mist px-2 py-1 text-[11px] font-medium text-ink transition hover:border-graphite/40 hover:bg-ink/[0.04]"
        >
          Edit text
        </button>
      </div>

      <div className="space-y-2.5 px-4 pb-4">
        {layerRuns.length > 1 && (
          <div className="flex gap-1">
            {layerRuns.map((item, position) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setChosen(position)}
                title={item.content.slice(0, 60)}
                className={`min-w-0 flex-1 truncate rounded-md border px-2 py-1 text-[11px] transition ${
                  position === index
                    ? "border-signal/40 bg-signal/10 text-signal"
                    : "border-mist text-graphite hover:bg-ink/[0.04]"
                }`}
              >
                {item.content.slice(0, 14) || `Run ${position + 1}`}
              </button>
            ))}
          </div>
        )}

        <Row label="Font">
          <select
            value={run.style.family}
            onChange={(event) => {
              const family = event.target.value;
              // A face carries its own weight list, so a 900 that existed on
              // Roboto becomes the nearest thing the new family actually ships.
              patch({ family, weight: nearestWeight(family, run.style.weight) });
            }}
            className="w-full min-w-0 rounded-md border border-mist bg-white px-1.5 py-1 text-[12px] text-ink outline-none focus:border-graphite/40"
          >
            {FONT_NAMES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Weight">
          <select
            value={run.style.weight}
            onChange={(event) => patch({ weight: Number(event.target.value) })}
            className="w-full rounded-md border border-mist bg-white px-1.5 py-1 text-[12px] text-ink outline-none focus:border-graphite/40"
          >
            {weights.map((weight) => (
              <option key={weight} value={weight}>
                {weight}
              </option>
            ))}
          </select>
        </Row>

        <div className="grid grid-cols-2 gap-2">
          <Row label={shrunk ? `Size (fits at ${Math.round(rendered!.size)})` : "Size"}>
            <NumberField value={run.style.size} step={1} min={4} onCommit={(size) => patch({ size })} />
          </Row>
          <Row label="Leading">
            <NumberField
              value={run.style.lineHeight}
              step={0.05}
              min={0.6}
              places={2}
              onCommit={(lineHeight) => patch({ lineHeight })}
            />
          </Row>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Row label="Tracking">
            <NumberField
              value={run.style.letterSpacing}
              step={0.1}
              places={2}
              onCommit={(letterSpacing) => patch({ letterSpacing })}
            />
          </Row>
          <Row label="Colour">
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={normalizeHex(run.style.fill)}
                onChange={(event) => patch({ fill: event.target.value })}
                aria-label="Text colour"
                className="h-6 w-6 shrink-0 cursor-pointer rounded border border-mist bg-white p-0.5"
              />
              <span className="truncate font-mono text-[11px] text-graphite">
                {normalizeHex(run.style.fill)}
              </span>
            </div>
          </Row>
        </div>

        <Row label="Align">
          <div className="flex gap-1">
            {ALIGNMENTS.map((option) => (
              <button
                key={option.value}
                type="button"
                title={option.label}
                aria-label={option.label}
                aria-pressed={run.style.anchor === option.value}
                onClick={() => patch({ anchor: option.value })}
                className={`flex-1 rounded-md border py-1.5 transition ${
                  run.style.anchor === option.value
                    ? "border-signal/40 bg-signal/10 text-signal"
                    : "border-mist text-graphite hover:bg-ink/[0.04]"
                }`}
              >
                <svg viewBox="0 0 16 14" className="mx-auto h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                  <path d={option.path} />
                </svg>
              </button>
            ))}
          </div>
        </Row>

        {rendered?.overflows && (
          <p className="rounded-md border border-amber/40 bg-amber/5 px-2 py-1.5 text-[11px] leading-snug text-amber">
            Still overflows at the smallest readable size. Cut words, widen the box, or ask
            for a rework.
          </p>
        )}

        <label className="flex cursor-pointer items-start gap-2 pt-0.5">
          <input
            type="checkbox"
            checked={run.canShrink}
            onChange={(event) => patch({ fit: event.target.checked ? "shrink" : "none" })}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#2B5FFF]"
          />
          <span className="text-[12px] leading-snug text-graphite">
            Shrink to fit
            <span className="block text-[11px] text-graphite/65">
              Scales the type down when the copy outgrows its box, never past the format&apos;s
              legibility floor.
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-graphite/75">{label}</span>
      {children}
    </label>
  );
}

/**
 * Commits on blur and Enter rather than on every keystroke.
 *
 * Each commit re-wraps the block and pushes an undo entry, so reacting to
 * keystrokes would fill the history with the digits of a number being typed.
 */
function NumberField({
  value,
  step,
  min,
  places = 0,
  onCommit,
}: {
  value: number;
  step: number;
  min?: number;
  places?: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value.toFixed(places);

  const commit = () => {
    const parsed = Number.parseFloat(draft ?? "");
    setDraft(null);
    if (!Number.isFinite(parsed)) return;
    if (min !== undefined && parsed < min) return onCommit(min);
    onCommit(parsed);
  };

  return (
    <input
      type="number"
      step={step}
      min={min}
      value={shown}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className="w-full rounded-md border border-mist bg-white px-1.5 py-1 font-mono text-[12px] text-ink outline-none focus:border-graphite/40"
    />
  );
}

/** The colour input only accepts #rrggbb, and documents carry other notations. */
function normalizeHex(value: string): string {
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();

  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(trimmed);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();

  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(trimmed);
  if (rgb) {
    const hex = rgb
      .slice(1, 4)
      .map((part) => Math.max(0, Math.min(255, Math.round(Number(part)))).toString(16).padStart(2, "0"))
      .join("");
    return `#${hex}`;
  }

  return "#111111";
}
