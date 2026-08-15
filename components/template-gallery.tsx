"use client";

import { useEffect, useRef } from "react";

import { useComposer } from "@/lib/composer/store";
import { resolveIcons } from "@/lib/svg/icons";
import { PLATFORMS, PLATFORM_LABELS, type Platform, type Template } from "@/lib/templates/catalog";
import { PRESETS } from "@/lib/layout/presets";

export type GalleryTemplate = Template & { svg: string };

// Every preview is fitted into one box, so a story, a thumbnail and a flyer sit
// in the same grid at their true proportions instead of being squared off.
const PREVIEW = { width: 208, height: 176 };

export function TemplateGallery({ templates }: { templates: GalleryTemplate[] }) {
  const root = useRef<HTMLDivElement>(null);
  const templateId = useComposer((state) => state.templateId);
  const selectTemplate = useComposer((state) => state.selectTemplate);

  // Contact-row glyphs are placeholders in the source, resolved at render time
  // exactly as the studio does it, so a card is never missing its icons.
  useEffect(() => {
    for (const svg of Array.from(root.current?.querySelectorAll("svg") ?? [])) {
      resolveIcons(svg);
    }
  }, []);

  const groups = PLATFORMS.map((platform) => ({
    platform,
    items: templates.filter((template) => template.platform === platform),
  })).filter((group) => group.items.length > 0);

  return (
    <section id="templates" ref={root} className="mx-auto w-full max-w-6xl px-6 scroll-mt-8">
      <div className="mb-8 text-center">
        <h2 className="font-display text-2xl font-bold tracking-[-0.02em]">Start from a layout</h2>
        <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-graphite">
          Each one is drawn at the size it is for. Pick one and describe your version,
          or skip it and describe the whole thing.
        </p>
      </div>

      <div className="space-y-10">
        {groups.map((group) => (
          <div key={group.platform}>
            <PlatformHeading platform={group.platform} count={group.items.length} />

            <div className="grid grid-cols-[repeat(auto-fill,minmax(232px,1fr))] gap-4">
              {group.items.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  selected={templateId === template.id}
                  onSelect={() => selectTemplate(template.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlatformHeading({ platform, count }: { platform: Platform; count: number }) {
  return (
    <div className="mb-3 flex items-baseline gap-2.5">
      <h3 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-graphite">
        {PLATFORM_LABELS[platform]}
      </h3>
      <span className="text-[13px] text-ink/30">{count}</span>
    </div>
  );
}

function TemplateCard({
  template,
  selected,
  onSelect,
}: {
  template: GalleryTemplate;
  selected: boolean;
  onSelect: () => void;
}) {
  const preset = PRESETS[template.presetId];
  const scale = Math.min(PREVIEW.width / preset.width, PREVIEW.height / preset.height);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`group flex flex-col rounded-2xl border bg-white/80 p-3 text-left backdrop-blur-sm transition ${
        selected
          ? "border-signal ring-2 ring-signal/30"
          : "border-ink/10 hover:border-ink/25 hover:bg-white"
      }`}
    >
      <div
        className="flex items-center justify-center rounded-xl bg-mist/45"
        style={{ height: PREVIEW.height + 24 }}
      >
        <div
          // Authored in this repo, not model output, so there is nothing to
          // sanitize here. Everything that arrives from the agent goes through
          // sanitizeSvg before it reaches the DOM.
          dangerouslySetInnerHTML={{ __html: template.svg }}
          className="overflow-hidden rounded-md shadow-[0_2px_10px_-2px_rgba(11,11,15,0.25)] [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
          style={{
            width: Math.round(preset.width * scale),
            height: Math.round(preset.height * scale),
          }}
        />
      </div>

      <div className="mt-3 flex items-start justify-between gap-2">
        <span className="text-[15px] font-semibold leading-snug">{template.label}</span>
        {selected && (
          <span className="mt-0.5 shrink-0 rounded-full bg-signal px-2 py-0.5 text-[11px] font-medium text-paper">
            Selected
          </span>
        )}
      </div>

      <p className="mt-1 text-[13px] leading-relaxed text-graphite">{template.blurb}</p>

      <p className="mt-2 font-mono text-[11px] text-ink/40">
        {preset.label} · {preset.width} × {preset.height}
      </p>
    </button>
  );
}
