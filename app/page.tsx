import { DEFAULT_MODEL, getModelOptions } from "@/lib/ai/models";

export const dynamic = "force-dynamic";

export default async function Home() {
  const models = await getModelOptions();
  const cursorReady = Boolean(process.env.CURSOR_API_KEY);
  const geminiReady = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-10 px-8 py-16">
      <header className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-graphite">Phase 1</p>
        <h1 className="font-display text-5xl font-extrabold tracking-tight">Marketing Assets</h1>
        <p className="text-lg text-graphite">
          Marketing assets that stay editable. Scaffold is up; the studio lands in later phases.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-graphite">
          Credential path
        </h2>
        <ul className="divide-y divide-mist rounded-xl border border-mist bg-white">
          <StatusRow label="Cursor SDK (CURSOR_API_KEY)" ready={cursorReady} />
          <StatusRow label="Gemini (GEMINI_API_KEY)" ready={geminiReady} />
        </ul>
        <p className="text-sm text-graphite">
          Both resolve through the macOS Keychain broker. If either reads &ldquo;missing&rdquo;, the
          dev server was started without the nested <code className="font-mono">secret-env</code>{" "}
          wrapper.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-graphite">
          Live model catalog
        </h2>
        <p className="text-sm text-graphite">
          Default: <code className="font-mono text-ink">{DEFAULT_MODEL}</code>
        </p>
        <ul className="grid grid-cols-2 gap-2">
          {models.slice(0, 12).map((model) => (
            <li
              key={model.id}
              className="truncate rounded-lg border border-mist bg-white px-3 py-2 font-mono text-xs text-graphite"
            >
              {model.id}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function StatusRow({ label, ready }: { label: string; ready: boolean }) {
  return (
    <li className="flex items-center justify-between px-4 py-3">
      <span className="text-sm">{label}</span>
      <span
        className={`font-mono text-xs font-medium ${ready ? "text-vector" : "text-magenta"}`}
      >
        {ready ? "resolved" : "missing"}
      </span>
    </li>
  );
}
