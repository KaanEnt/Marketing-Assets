/**
 * The signature background. Three slow-drifting radial blooms over warm paper,
 * densest around the fold. Pure CSS, so it costs nothing and degrades to a static
 * wash under prefers-reduced-motion.
 *
 * Sized to its container rather than the page, and washed back out to paper at
 * its own bottom edge. It belongs to the hero: letting it run the full height of
 * a scrolling page leaves the lower half fully saturated, which fights the
 * template previews and reads as a rendering fault rather than a choice.
 */
export function MeshGradient() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-paper" />

      <div
        className="bloom-a absolute -left-[10%] top-[26%] h-[70vh] w-[80vw] rounded-full opacity-90 blur-[90px]"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(43,95,255,0.85) 0%, rgba(43,95,255,0.35) 42%, rgba(43,95,255,0) 70%)",
        }}
      />
      <div
        className="bloom-b absolute -right-[14%] top-[44%] h-[68vh] w-[72vw] rounded-full opacity-85 blur-[100px]"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(233,61,155,0.8) 0%, rgba(233,61,155,0.3) 45%, rgba(233,61,155,0) 72%)",
        }}
      />
      <div
        className="bloom-c absolute left-[18%] bottom-[-22%] h-[62vh] w-[76vw] rounded-full opacity-80 blur-[110px]"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(255,176,32,0.55) 0%, rgba(233,61,155,0.3) 48%, rgba(233,61,155,0) 74%)",
        }}
      />

      {/*
       * Keeps the top of the page clean so the nav and headline stay legible, and
       * returns to paper at the bottom so the section below starts on a calm
       * surface. One gradient rather than two overlays: a pair of them terminate
       * against each other and leave a visible horizontal seam.
       */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, #FAF9F6 4%, rgba(250,249,246,0.92) 22%, rgba(250,249,246,0.68) 38%, rgba(250,249,246,0.34) 52%, rgba(250,249,246,0.12) 66%, rgba(250,249,246,0.38) 80%, rgba(250,249,246,0.78) 91%, #FAF9F6 100%)",
        }}
      />
    </div>
  );
}
