"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Wordmark } from "@/components/wordmark";
import { AdaptPanel } from "@/components/studio/adapt-panel";
import { Canvas } from "@/components/studio/canvas";
import { FormatBar } from "@/components/studio/format-bar";
import { LayerList } from "@/components/studio/layer-list";
import { TextProperties } from "@/components/studio/text-properties";
import { useEditor } from "@/lib/editor/store";
import { streamSse } from "@/lib/sse-client";
import { readLayers, sanitizeSvg } from "@/lib/svg/layers";
import { refineMessage } from "@/lib/ai/prompts/refine";
import type { AdaptCandidate } from "@/lib/layout/adapt";
import { PRESETS, isPresetId, type PresetId } from "@/lib/layout/presets";

type Message = { role: "user" | "assistant"; text: string };
type Status = "idle" | "streaming" | "correcting" | "done" | "error";

export function Studio() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [statusNote, setStatusNote] = useState("");
  const [input, setInput] = useState("");
  const [adapting, setAdapting] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const agentId = useRef<string | undefined>(undefined);
  const started = useRef(false);

  const presetId = useEditor((state) => state.presetId);
  const layers = useEditor((state) => state.layers);
  const selection = useEditor((state) => state.selection);
  const setDocument = useEditor((state) => state.setDocument);
  const undo = useEditor((state) => state.undo);
  const redo = useEditor((state) => state.redo);
  const canUndo = useEditor((state) => state.past.length > 0);
  const canRedo = useEditor((state) => state.future.length > 0);

  const generate = useCallback(
    async (message: string, targetPreset: PresetId, layerIds?: string[]) => {
      setMessages((prev) => [...prev, { role: "user", text: message }, { role: "assistant", text: "" }]);
      setStatus("streaming");
      setStatusNote("Composing the layout");

      try {
        await streamSse(
          "/api/generate",
          { message, presetId: targetPreset, agentId: agentId.current, currentLayerIds: layerIds },
          {
            agent: (data) => {
              agentId.current = data.agentId as string;
              if (typeof data.model === "string") setModel(data.model);
            },
            token: (data) => {
              const text = data.text as string;
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") next[next.length - 1] = { ...last, text: last.text + text };
                return next;
              });
            },
            correcting: (data) => {
              setStatus("correcting");
              setStatusNote(`Fixing contract violations (pass ${data.attempt as number})`);
            },
            // The primary model spent its correction rounds without producing a
            // document that satisfies the contract, so a different one starts
            // clean. Said out loud rather than silently, because the project's
            // agent moves with it and every later turn runs on the new model.
            rescuing: (data) => {
              setStatus("correcting");
              setStatusNote(`${data.from as string} could not satisfy the contract. Retrying on ${data.to as string}`);
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  text: `${data.from as string} could not satisfy the output contract after two corrections. Starting over on ${data.to as string}.`,
                },
                { role: "assistant", text: "" },
              ]);
            },
            document: (data) => {
              if (typeof data.model === "string") setModel(data.model);
              const clean = sanitizeSvg(data.svg as string);
              const incomingPreset = data.presetId as string;
              setDocument(
                clean,
                isPresetId(incomingPreset) ? incomingPreset : targetPreset,
                readLayers(clean),
              );

              // The streamed prose contains the whole SVG source; swap it for the
              // model's one-line description so the transcript stays readable.
              const note = (data.note as string) || "Done.";
              setMessages((prev) => {
                const next = [...prev];
                if (next[next.length - 1]?.role === "assistant") {
                  next[next.length - 1] = { role: "assistant", text: note };
                }
                return next;
              });
            },
            done: () => {
              setStatus("done");
              setStatusNote("");
            },
            error: (data) => {
              setStatus("error");
              setStatusNote((data.message as string) || "Generation failed.");
            },
          },
        );
      } catch (error) {
        setStatus("error");
        setStatusNote(error instanceof Error ? error.message : "Generation failed.");
      }
    },
    [setDocument],
  );

  /**
   * Take an adapted document as the live one.
   *
   * The transforms are handed over explicitly rather than left to the usual
   * carry-over-by-id path, because those carried transforms belong to the old
   * frame: reusing them would place every layer where it sat on a differently
   * shaped artboard and undo the entire solve.
   */
  const applyCandidate = useCallback(
    (candidate: AdaptCandidate) => {
      const clean = sanitizeSvg(candidate.svg);
      setDocument(clean, candidate.preset.id, readLayers(clean), {
        transforms: candidate.transforms,
        keepSlots: true,
      });
      setAdapting(false);

      const fixed = candidate.issues.filter((issue) => issue.fixed).length;
      const open = candidate.issues.length - fixed;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `Adapted to ${candidate.preset.label} (${candidate.preset.width} × ${candidate.preset.height}). ${
            fixed > 0 ? `${fixed} layer${fixed === 1 ? "" : "s"} auto-corrected. ` : ""
          }${open > 0 ? `${open} problem${open === 1 ? "" : "s"} left for a rework.` : "No problems found."}`,
        },
      ]);
    },
    [setDocument],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // No brief means the studio was opened directly; status is already idle.
    const stored = sessionStorage.getItem("brief");
    if (!stored) return;

    void (async () => {
      let brief: { message: string; presetId: string };
      try {
        brief = JSON.parse(stored) as { message: string; presetId: string };
      } catch {
        setStatus("error");
        setStatusNote("Could not read the brief.");
        return;
      }

      const target = isPresetId(brief.presetId) ? brief.presetId : "us-letter";
      await generate(brief.message, target);
    })();
  }, [generate]);

  const busy = status === "streaming" || status === "correcting";
  const preset = PRESETS[presetId];

  return (
    <div className="flex h-screen flex-col bg-paper">
      <header className="flex shrink-0 items-center justify-between border-b border-mist px-5 py-2.5">
        <Wordmark muted />

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0.5">
            <HeaderButton label="Undo" disabled={!canUndo} onClick={undo}>
              <path d="M4 8h6.5a3.5 3.5 0 0 1 0 7H7M4 8l3-3M4 8l3 3" />
            </HeaderButton>
            <HeaderButton label="Redo" disabled={!canRedo} onClick={redo}>
              <path d="M16 8H9.5a3.5 3.5 0 0 0 0 7H13M16 8l-3-3M16 8l-3 3" />
            </HeaderButton>
          </div>

          {model && (
            <span
              title="Model that produced the current document"
              className="rounded-full border border-mist px-2.5 py-1 font-mono text-[11px] text-graphite/80"
            >
              {model}
            </span>
          )}

          <FormatBar
            preset={preset}
            disabled={busy || layers.length === 0}
            onAdapt={() => setAdapting(true)}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[352px] shrink-0 flex-col border-r border-mist">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {messages.length === 0 && (
              <p className="text-sm text-graphite">
                No brief yet. Head back to the{" "}
                <Link href="/" className="text-signal underline underline-offset-2">
                  home page
                </Link>{" "}
                to start one.
              </p>
            )}

            {messages.map((message, index) => (
              <div key={index} className={message.role === "user" ? "flex justify-end" : ""}>
                <div
                  className={
                    message.role === "user"
                      ? "max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-sm leading-relaxed text-paper"
                      : "max-w-[92%] text-sm leading-relaxed text-graphite"
                  }
                >
                  {message.role === "assistant" && !message.text && busy ? <ThinkingDots /> : message.text}
                </div>
              </div>
            ))}

            {busy && (
              <div className="flex items-center gap-2 text-xs text-graphite">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal" />
                {statusNote}
              </div>
            )}

            {status === "error" && (
              <p className="rounded-xl border border-magenta/30 bg-magenta/5 px-3 py-2.5 text-sm text-magenta">
                {statusNote}
              </p>
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              const message = input.trim();
              if (!message || busy) return;
              setInput("");
              void generate(message, presetId, layers.map((layer) => layer.id));
            }}
            className="shrink-0 border-t border-mist p-3"
          >
            <div className="flex items-end gap-2 rounded-2xl border border-mist bg-white p-2 focus-within:border-graphite/40">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={1}
                disabled={busy}
                placeholder={busy ? "Working..." : "Ask for a change..."}
                className="max-h-28 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-graphite/50 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition enabled:hover:bg-signal disabled:opacity-25"
                aria-label="Send"
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5">
                  <path d="M8 13V3M8 3 3.5 7.5M8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </form>
        </aside>

        <Canvas busy={busy} preset={preset} />

        <aside className="flex w-[288px] shrink-0 flex-col border-l border-mist">
          <LayerList busy={busy} />
          {/* Keyed on the layer so the run picker resets when the selection moves,
              rather than pointing at a run index the new layer may not have. */}
          <TextProperties key={selection[0] ?? "none"} />
        </aside>
      </div>

      <AdaptPanel
        open={adapting}
        busy={busy}
        onClose={() => setAdapting(false)}
        onApply={applyCandidate}
        onRefine={(candidate) => {
          // Show the solved version first. Even an imperfect adaptation is a
          // better thing to sit and look at than the previous format while the
          // model works, and if the rework fails the user still has this.
          applyCandidate(candidate);
          void generate(
            refineMessage(candidate.preset, candidate.issues),
            candidate.preset.id,
            Object.keys(candidate.transforms),
          );
        }}
      />
    </div>
  );
}

function HeaderButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-lg p-1.5 text-graphite transition enabled:hover:bg-ink/[0.06] enabled:hover:text-ink disabled:opacity-25"
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex gap-1" aria-label="Working">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-graphite/40"
          style={{ animationDelay: `${index * 140}ms` }}
        />
      ))}
    </span>
  );
}
