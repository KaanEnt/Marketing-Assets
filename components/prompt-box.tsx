"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { storeBrief } from "@/lib/assets/brief";
import { imageFilesFrom, imageFilesFromTransfer, importAsset } from "@/lib/assets/import";
import type { Asset } from "@/lib/assets/types";
import { useComposer } from "@/lib/composer/store";
import { PRESET_IDS, PRESETS } from "@/lib/layout/presets";
import { getTemplate } from "@/lib/templates/catalog";

// Short labels so the row never wraps; the full brief is what actually gets sent.
const EXAMPLES = [
  {
    label: "Insurance flyer",
    presetId: "us-letter",
    prompt:
      "Flyer for an insurance agency. Cyan and navy, corporate and trustworthy. Headline \"Insurance Agency\", a services list, a quote CTA, and a city skyline photo.",
  },
  {
    label: "Travel story",
    presetId: "ig-story",
    prompt:
      "Instagram story announcing a travel insurance launch. Bold blue and orange, high energy, big reversed headline and a hero illustration.",
  },
  {
    label: "Consultancy banner",
    presetId: "li-post",
    prompt:
      "LinkedIn banner for a strategy consultancy. Teal, understated and editorial, circular masked photography with concentric rings.",
  },
];

export function PromptBox() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  // Ids are assigned from the existing list, and decoding is async, so the second file
  // of a multi-select has to see the first one's id already taken. State alone lags.
  const assetsRef = useRef<Asset[]>([]);

  // Format and layout live in the store rather than here, because the gallery
  // sits outside this component and the two are chosen together.
  const presetId = useComposer((state) => state.presetId);
  const templateId = useComposer((state) => state.templateId);
  const setPreset = useComposer((state) => state.setPreset);
  const selectTemplate = useComposer((state) => state.selectTemplate);

  const template = getTemplate(templateId ?? "");

  function commitAssets(next: Asset[]) {
    assetsRef.current = next;
    setAssets(next);
  }

  async function importFiles(files: File[]) {
    for (const file of files) {
      try {
        const asset = await importAsset(file, assetsRef.current);
        commitAssets([...assetsRef.current, asset]);
        setNotice("");
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "That image could not be imported.");
      }
    }
  }

  function submit(message: string) {
    const brief = message.trim();
    if (!brief) return;

    // No auth and no database, so the brief rides to the studio in session storage
    // rather than a query string that would be ugly and length-limited.
    const stored = storeBrief({ message: brief, presetId, templateId, assets });
    if (!stored.ok) {
      setNotice(
        stored.reason === "too-large"
          ? "Those images were too large to carry over. Start the brief, then import them in the studio."
          : "This browser is blocking session storage, so the brief cannot be carried over.",
      );
      if (stored.reason === "unavailable") return;
    }

    router.push("/studio");
  }

  return (
    <div className="w-full max-w-2xl">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(value);
        }}
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
        className={`rounded-3xl border bg-white/95 p-2 shadow-[0_24px_70px_-20px_rgba(11,11,15,0.28)] backdrop-blur-sm transition ${
          dragging ? "border-signal" : "border-white/70"
        }`}
      >
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onPaste={(event) => {
            const files = imageFilesFromTransfer(event.clipboardData.items);
            if (files.length === 0) return;
            event.preventDefault();
            void importFiles(files);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit(value);
            }
          }}
          rows={2}
          placeholder={
            template
              ? `Describe your version of the ${template.label.toLowerCase()}...`
              : "Describe the asset you need..."
          }
          className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-[17px] leading-relaxed text-ink outline-none placeholder:text-graphite/55"
        />

        {assets.length > 0 && (
          <div className="flex flex-wrap gap-2 px-2 pb-2">
            {assets.map((asset) => (
              <span
                key={asset.id}
                className="group flex items-center gap-2 rounded-xl border border-mist py-1 pl-1 pr-1.5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a data URI has nothing to optimise */}
                <img src={asset.dataUri} alt="" className="h-8 w-8 rounded-lg object-cover" />
                <span className="max-w-[128px] truncate text-[13px] text-graphite">{asset.label}</span>
                <button
                  type="button"
                  onClick={() => commitAssets(assetsRef.current.filter((item) => item.id !== asset.id))}
                  aria-label={`Remove ${asset.label}`}
                  className="rounded p-1 text-graphite/50 transition hover:text-magenta"
                >
                  <svg viewBox="0 0 14 14" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3.5 3.5 10.5 10.5M10.5 3.5 3.5 10.5" strokeLinecap="round" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 px-2 pb-1">
          <div className="flex min-w-0 items-center gap-1.5">
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
              onClick={() => fileInput.current?.click()}
              title="Import an image"
              aria-label="Import an image"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-mist bg-paper text-graphite transition hover:border-graphite/40 hover:text-ink"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9.5 4 5 8.5a2.1 2.1 0 0 0 3 3l4.5-4.5a3.5 3.5 0 0 0-5-5L3 6.5a5 5 0 0 0 7 7l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <label className="relative shrink-0">
              <span className="sr-only">Format</span>
              <select
                value={presetId}
                onChange={(event) => setPreset(event.target.value)}
                className="cursor-pointer appearance-none rounded-full border border-mist bg-paper py-2 pl-3.5 pr-9 text-sm font-medium text-graphite outline-none transition hover:border-graphite/40 focus:border-signal"
              >
                {PRESET_IDS.filter((id) => PRESETS[id].family !== "logo").map((id) => (
                  <option key={id} value={id}>
                    {PRESETS[id].label}
                  </option>
                ))}
              </select>
              <svg
                aria-hidden
                viewBox="0 0 12 12"
                className="pointer-events-none absolute right-3.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-graphite"
              >
                <path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </label>

            {template && (
              <button
                type="button"
                onClick={() => selectTemplate(template.id)}
                className="flex min-w-0 items-center gap-1.5 rounded-full bg-signal/10 py-2 pl-3 pr-2.5 text-sm font-medium text-signal transition hover:bg-signal/15"
                title="Clear the layout"
              >
                <span className="truncate">{template.label}</span>
                <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 shrink-0">
                  <path d="M3 3l6 6M9 3l-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={!value.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition enabled:hover:bg-signal disabled:cursor-not-allowed disabled:opacity-25"
            aria-label="Generate"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4">
              <path d="M8 13V3M8 3 3.5 7.5M8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </form>

      {notice && <p className="mt-3 text-center text-sm text-magenta">{notice}</p>}

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example.label}
            type="button"
            onClick={() => {
              setValue(example.prompt);
              setPreset(example.presetId);
            }}
            className="rounded-full border border-ink/10 bg-white/70 px-3.5 py-1.5 text-[13px] text-graphite backdrop-blur-sm transition hover:border-ink/25 hover:text-ink"
          >
            {example.label}
          </button>
        ))}
      </div>
    </div>
  );
}
