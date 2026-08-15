"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { Wordmark } from "@/components/wordmark";
import { Canvas } from "@/components/studio/canvas";
import { LayerList } from "@/components/studio/layer-list";
import { streamSse } from "@/lib/sse-client";
import { readLayers, sanitizeSvg, type LayerInfo } from "@/lib/svg/layers";
import { PRESETS, isPresetId } from "@/lib/layout/presets";

type Message = { role: "user" | "assistant"; text: string };

type Status = "idle" | "streaming" | "correcting" | "done" | "error";

export function Studio() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [statusNote, setStatusNote] = useState("");
  const [svg, setSvg] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [presetId, setPresetId] = useState("us-letter");
  const [input, setInput] = useState("");
  const agentId = useRef<string | undefined>(undefined);
  const started = useRef(false);

  const generate = useCallback(
    async (message: string, targetPreset: string, layerIds?: string[]) => {
      setMessages((prev) => [...prev, { role: "user", text: message }, { role: "assistant", text: "" }]);
      setStatus("streaming");
      setStatusNote("Composing the layout");

      try {
        await streamSse("/api/generate", {
          message,
          presetId: targetPreset,
          agentId: agentId.current,
          currentLayerIds: layerIds,
        }, {
          agent: (data) => {
            agentId.current = data.agentId as string;
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
          document: (data) => {
            const clean = sanitizeSvg(data.svg as string);
            setSvg(clean);
            setLayers(readLayers(clean));
            setSelected(null);
            // The streamed prose includes the whole SVG source; replace it with the
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
        });
      } catch (error) {
        setStatus("error");
        setStatusNote(error instanceof Error ? error.message : "Generation failed.");
      }
    },
    [],
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
      setPresetId(target);
      await generate(brief.message, target);
    })();
  }, [generate]);

  const busy = status === "streaming" || status === "correcting";
  const preset = isPresetId(presetId) ? PRESETS[presetId] : PRESETS["us-letter"];

  return (
    <div className="flex h-screen flex-col bg-paper">
      <header className="flex shrink-0 items-center justify-between border-b border-mist px-5 py-3">
        <Wordmark muted />
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-full border border-mist px-3 py-1 font-medium text-graphite">
            {preset.label}
          </span>
          <span className="font-mono text-xs text-graphite/70">
            {preset.width} × {preset.height}
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[360px] shrink-0 flex-col border-r border-mist">
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

        <Canvas svg={svg} busy={busy} selected={selected} preset={preset} />

        <LayerList layers={layers} selected={selected} onSelect={setSelected} busy={busy} />
      </div>
    </div>
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
