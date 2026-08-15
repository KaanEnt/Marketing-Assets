"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Wordmark } from "@/components/wordmark";
import { AdaptPanel } from "@/components/studio/adapt-panel";
import { AssetTray } from "@/components/studio/asset-tray";
import { Canvas } from "@/components/studio/canvas";
import { EnhanceCard, type Comparison } from "@/components/studio/enhance-card";
import { FormatBar } from "@/components/studio/format-bar";
import { LayerList } from "@/components/studio/layer-list";
import { TextProperties } from "@/components/studio/text-properties";
import { readBrief } from "@/lib/assets/brief";
import { imageFilesFrom, imageFilesFromTransfer, importAsset } from "@/lib/assets/import";
import { summarizeAssets, type Asset } from "@/lib/assets/types";
import { useEditor } from "@/lib/editor/store";
import { measureDataUri } from "@/lib/images/import";
import {
  ENHANCE_MODES,
  MODE_SUMMARY,
  parseEnhanceCommand,
  type EnhanceCommand,
} from "@/lib/images/modes";
import { streamSse } from "@/lib/sse-client";
import { readLayers, sanitizeSvg } from "@/lib/svg/layers";
import { refineMessage } from "@/lib/ai/prompts/refine";
import type { AdaptCandidate } from "@/lib/layout/adapt";
import { PRESETS, isPresetId, type PresetId } from "@/lib/layout/presets";

type Message = {
  role: "user" | "assistant";
  text: string;
  /** Set on the assistant's reply to an /enhance run. */
  comparison?: Comparison;
};

type Status = "idle" | "streaming" | "correcting" | "enhancing" | "done" | "error";

export function Studio() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [statusNote, setStatusNote] = useState("");
  const [input, setInput] = useState("");
  const [dragging, setDragging] = useState(false);
  const [adapting, setAdapting] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const agentId = useRef<string | undefined>(undefined);
  const started = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const presetId = useEditor((state) => state.presetId);
  const layers = useEditor((state) => state.layers);
  const selection = useEditor((state) => state.selection);
  const setDocument = useEditor((state) => state.setDocument);
  const addAsset = useEditor((state) => state.addAsset);
  const updateAsset = useEditor((state) => state.updateAsset);
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
          {
            message,
            presetId: targetPreset,
            agentId: agentId.current,
            currentLayerIds: layerIds,
            // Read at send time rather than from the closure: an import or an
            // enhancement may have landed while the user was typing.
            assets: summarizeAssets(useEditor.getState().assets),
          },
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

  /** Ask the vision model what the picture shows, so the design agent can compose for it. */
  const describeAsset = useCallback(
    async (id: string, dataUri: string) => {
      try {
        const response = await fetch("/api/describe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ dataUri }),
        });
        if (!response.ok) return;

        const { description } = (await response.json()) as { description?: string };
        if (!description) return;

        const current = useEditor.getState().assets.find((asset) => asset.id === id);
        if (!current) return;

        updateAsset(id, {
          description,
          // Backfilling the original's description too keeps a revert from leaving the
          // agent with a caption of an image that is no longer there.
          original: current.original.description
            ? current.original
            : { ...current.original, description },
        });
      } catch {
        // A missing description degrades the layout brief; it does not break the import.
      }
    },
    [updateAsset],
  );

  const importFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        try {
          const asset = await importAsset(file, useEditor.getState().assets);
          addAsset(asset);
          void describeAsset(asset.id, asset.dataUri);
        } catch (error) {
          setStatus("error");
          setStatusNote(error instanceof Error ? error.message : "That image could not be imported.");
        }
      }
    },
    [addAsset, describeAsset],
  );

  const runEnhance = useCallback(
    async (command: EnhanceCommand, typed: string) => {
      const state = useEditor.getState();
      const target =
        state.assets.find((asset) => asset.id === state.activeAssetId) ??
        state.assets[state.assets.length - 1];

      setMessages((prev) => [...prev, { role: "user", text: typed }]);

      if (!target) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: "Import an image first: use the attach button below, or paste or drop one into this panel.",
          },
        ]);
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", text: "" }]);
      setStatus("enhancing");
      setStatusNote(`Enhancing ${target.id} · ${command.mode}`);

      try {
        const response = await fetch("/api/enhance", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            // Always from the import, never from the last result, so switching modes or
            // re-running one never stacks a second pass on top of the first.
            dataUri: target.original.dataUri,
            mode: command.mode,
            instruction: command.instruction,
          }),
        });

        const payload = (await response.json()) as { dataUri?: string; description?: string; error?: string };

        if (!response.ok || !payload.dataUri) {
          setStatus("error");
          setStatusNote(payload.error || "Enhancement failed.");
          setMessages((prev) => prev.slice(0, -1));
          return;
        }

        const { width, height } = await measureDataUri(payload.dataUri);

        updateAsset(target.id, {
          dataUri: payload.dataUri,
          description: payload.description || target.description,
          width,
          height,
          kind: command.mode === "cutout" ? "cutout" : "photo",
          enhancedWith: command.mode,
        });

        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: "assistant",
            text: placementNote(target, command),
            comparison: {
              assetId: target.id,
              mode: command.mode,
              before: target.original.dataUri,
              after: payload.dataUri!,
              transparent: {
                before: target.original.kind === "cutout",
                after: command.mode === "cutout",
              },
            },
          };
          return next;
        });

        setStatus("done");
        setStatusNote("");
      } catch (error) {
        setStatus("error");
        setStatusNote(error instanceof Error ? error.message : "Enhancement failed.");
        setMessages((prev) => prev.slice(0, -1));
      }
    },
    [updateAsset],
  );

  const revertAsset = useCallback(
    (asset: Asset) => {
      updateAsset(asset.id, {
        dataUri: asset.original.dataUri,
        description: asset.original.description,
        width: asset.original.width,
        height: asset.original.height,
        kind: asset.original.kind,
        enhancedWith: undefined,
      });
    },
    [updateAsset],
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
    const brief = readBrief();
    if (!brief) return;

    void (async () => {
      for (const asset of brief.assets) {
        addAsset(asset);
        if (!asset.description) void describeAsset(asset.id, asset.dataUri);
      }

      const target = isPresetId(brief.presetId) ? brief.presetId : "us-letter";
      await generate(brief.message, target);
    })();
  }, [generate, addAsset, describeAsset]);

  const busy = status === "streaming" || status === "correcting" || status === "enhancing";
  const preset = PRESETS[presetId];
  const showCommands = input.trimStart().startsWith("/");

  function submit() {
    const message = input.trim();
    if (!message || busy) return;

    setInput("");

    const command = parseEnhanceCommand(message);
    if (command) {
      void runEnhance(command, message);
      return;
    }

    // A mistyped command must not quietly become a design brief and spend an agent turn.
    if (message.startsWith("/")) {
      setMessages((prev) => [
        ...prev,
        { role: "user", text: message },
        { role: "assistant", text: `There is no ${message.split(/\s+/)[0]} command. The only one is /enhance.` },
      ]);
      return;
    }

    void generate(message, presetId, layers.map((layer) => layer.id));
  }

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
        <aside
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void importFiles(imageFilesFrom(event.dataTransfer.files));
          }}
          className={`relative flex w-[352px] shrink-0 flex-col border-r transition ${
            dragging ? "border-signal bg-signal/[0.04]" : "border-mist"
          }`}
        >
          {dragging && (
            <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-signal bg-paper/80 text-sm font-medium text-signal">
              Drop to import
            </div>
          )}

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
                  {message.role === "assistant" && !message.text && busy ? (
                    <ThinkingDots />
                  ) : (
                    message.text
                  )}
                  {message.comparison && <EnhanceCard comparison={message.comparison} />}
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
              submit();
            }}
            className="shrink-0 border-t border-mist p-3"
          >
            {showCommands && <CommandHints onPick={(value) => setInput(value)} />}

            <AssetTray busy={busy} onRevert={revertAsset} />

            <div className="flex items-end gap-1.5 rounded-2xl border border-mist bg-white p-2 focus-within:border-graphite/40">
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  void importFiles(imageFilesFrom(event.target.files));
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
                title="Import an image"
                aria-label="Import an image"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-graphite transition enabled:hover:bg-ink/[0.06] enabled:hover:text-ink disabled:opacity-30"
              >
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9.5 4 5 8.5a2.1 2.1 0 0 0 3 3l4.5-4.5a3.5 3.5 0 0 0-5-5L3 6.5a5 5 0 0 0 7 7l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onPaste={(event) => {
                  const files = imageFilesFromTransfer(event.clipboardData.items);
                  if (files.length === 0) return;
                  event.preventDefault();
                  void importFiles(files);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={1}
                disabled={busy}
                placeholder={busy ? "Working..." : "Ask for a change, or /enhance an image..."}
                className="max-h-28 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-graphite/50 disabled:opacity-50"
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

/**
 * What happens next, stated per case.
 *
 * An enhancement that nothing in the design references changes nothing the user can
 * see, so the reply has to distinguish the three states rather than claim placement.
 * Telling them it is live when the canvas did not move reads as a broken command.
 */
function placementNote(asset: Asset, command: EnhanceCommand): string {
  const svg = useEditor.getState().svg;
  const subject = `${asset.id} · ${command.mode}`;

  if (!svg) {
    return `Enhanced ${subject}. Now describe the asset you want and it will be composed around this image.`;
  }

  return svg.includes(`data-asset="${asset.id}"`)
    ? `Enhanced ${subject}. The design already places it, so the canvas is up to date.`
    : `Enhanced ${subject}. Nothing in the design uses it yet. Ask for a revision that does, such as "rebuild this around ${asset.id} as the hero".`;
}

function CommandHints({ onPick }: { onPick: (value: string) => void }) {
  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-mist bg-white">
      <p className="border-b border-mist px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-graphite/70">
        /enhance · runs on the selected import
      </p>
      {ENHANCE_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onPick(`/enhance ${mode} `)}
          className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left transition hover:bg-ink/[0.04]"
        >
          <span className="font-mono text-[11px] text-signal">{mode}</span>
          <span className="text-[11px] leading-snug text-graphite">{MODE_SUMMARY[mode]}</span>
        </button>
      ))}
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
