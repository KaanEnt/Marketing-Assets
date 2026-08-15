import { MeshGradient } from "@/components/mesh-gradient";
import { PromptBox } from "@/components/prompt-box";
import { TemplateGallery } from "@/components/template-gallery";
import { Wordmark } from "@/components/wordmark";
import { templateGallery } from "@/lib/templates";

export default function Home() {
  // Read on the server so the previews ship inside the initial HTML. The skeleton
  // files never reach the client bundle, and the gallery needs no round trip.
  const templates = templateGallery();

  return (
    <main className="flex min-h-screen flex-col">
      {/* The gradient is scoped to this block, so the gallery below it sits on paper. */}
      <div className="relative flex min-h-screen flex-col overflow-hidden">
        <MeshGradient />

        <header className="relative z-10 flex items-center justify-between px-8 py-6">
          <Wordmark />
          <a
            href="https://github.com/KaanEnt/Marketing-Assets"
            className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper transition hover:bg-signal"
          >
            Source
          </a>
        </header>

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-20 text-center">
          <h1 className="max-w-3xl font-display text-[clamp(2.6rem,6.4vw,4.6rem)] font-extrabold leading-[1.02] tracking-[-0.035em]">
            Design something
            <br />
            that stays editable
          </h1>

          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-graphite">
            Describe the asset. Get back real vector layers you can still edit, not a
            flat image you have to redo.
          </p>

          <div className="mt-10 flex w-full justify-center">
            <PromptBox />
          </div>
        </div>
      </div>

      <div className="pb-20">
        <TemplateGallery templates={templates} />
      </div>

      <footer className="px-8 pb-7">
        <p className="text-center text-[13px] text-ink/45">
          Vector first. Every layer independent. One design, every format.
        </p>
      </footer>
    </main>
  );
}
