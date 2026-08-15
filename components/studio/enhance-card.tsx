"use client";

import type { EnhanceMode } from "@/lib/images/modes";

export type Comparison = {
  assetId: string;
  mode: EnhanceMode;
  before: string;
  after: string;
};

/**
 * Before and after, side by side.
 *
 * An enhancement is a claim about the user's own photograph, and the only way they can
 * check the claim is against the original. Showing the result alone asks them to trust
 * that the label, the face and the packaging survived.
 */
export function EnhanceCard({ comparison }: { comparison: Comparison }) {
  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-mist">
      <div className="grid grid-cols-2 divide-x divide-mist">
        <Pane label="Imported" src={comparison.before} />
        <Pane label={comparison.mode} src={comparison.after} accent />
      </div>
      <p className="border-t border-mist bg-paper px-2.5 py-1.5 font-mono text-[10px] text-graphite/70">
        {comparison.assetId}
      </p>
    </div>
  );
}

function Pane({ label, src, accent }: { label: string; src: string; accent?: boolean }) {
  return (
    <figure className="relative">
      <div
        className="aspect-[4/3] w-full"
        style={{
          backgroundImage:
            "linear-gradient(45deg,#E4E4E9 25%,transparent 25%,transparent 75%,#E4E4E9 75%),linear-gradient(45deg,#E4E4E9 25%,transparent 25%,transparent 75%,#E4E4E9 75%)",
          backgroundSize: "10px 10px",
          backgroundPosition: "0 0, 5px 5px",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a data URI has nothing to optimise */}
        <img src={src} alt={label} className="h-full w-full object-contain" />
      </div>
      <figcaption
        className={`absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide ${
          accent ? "bg-signal text-paper" : "bg-ink/70 text-paper"
        }`}
      >
        {label}
      </figcaption>
    </figure>
  );
}
