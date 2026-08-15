import Link from "next/link";

export function Wordmark({ muted = false }: { muted?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5">
      <svg viewBox="0 0 28 28" className="h-6 w-6" aria-hidden>
        <defs>
          <linearGradient id="wordmark-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2B5FFF" />
            <stop offset="100%" stopColor="#E93D9B" />
          </linearGradient>
        </defs>
        {/* Three offset plates: the layer stack, which is the whole product idea. */}
        <rect x="3" y="3" width="16" height="16" rx="4" fill="url(#wordmark-fill)" opacity="0.28" />
        <rect x="6.5" y="6.5" width="16" height="16" rx="4" fill="url(#wordmark-fill)" opacity="0.55" />
        <rect x="10" y="10" width="15" height="15" rx="4" fill="url(#wordmark-fill)" />
      </svg>
      <span
        className={`font-display text-[17px] font-bold tracking-[-0.02em] ${muted ? "text-graphite group-hover:text-ink" : "text-ink"}`}
      >
        Vellum
      </span>
    </Link>
  );
}
