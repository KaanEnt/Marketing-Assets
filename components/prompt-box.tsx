"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PRESET_IDS, PRESETS } from "@/lib/layout/presets";

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
  const [presetId, setPresetId] = useState<string>("us-letter");

  function submit(message: string) {
    const brief = message.trim();
    if (!brief) return;

    // No auth and no database, so the brief rides to the studio in session storage
    // rather than a query string that would be ugly and length-limited.
    sessionStorage.setItem("brief", JSON.stringify({ message: brief, presetId }));
    router.push("/studio");
  }

  return (
    <div className="w-full max-w-2xl">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit(value);
        }}
        className="rounded-3xl border border-white/70 bg-white/95 p-2 shadow-[0_24px_70px_-20px_rgba(11,11,15,0.28)] backdrop-blur-sm"
      >
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit(value);
            }
          }}
          rows={2}
          placeholder="Describe the asset you need..."
          className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-[17px] leading-relaxed text-ink outline-none placeholder:text-graphite/55"
        />

        <div className="flex items-center justify-between gap-3 px-2 pb-1">
          <label className="relative">
            <span className="sr-only">Format</span>
            <select
              value={presetId}
              onChange={(event) => setPresetId(event.target.value)}
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

          <button
            type="submit"
            disabled={!value.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-paper transition enabled:hover:bg-signal disabled:cursor-not-allowed disabled:opacity-25"
            aria-label="Generate"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4">
              <path d="M8 13V3M8 3 3.5 7.5M8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </form>

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example.label}
            type="button"
            onClick={() => {
              setValue(example.prompt);
              setPresetId(example.presetId);
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
