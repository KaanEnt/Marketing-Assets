import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: false },
  // @cursor/sdk ships a .LICENSE.txt next to its ESM chunks that Turbopack cannot
  // classify. It only ever runs server-side, so keep it out of the bundle graph.
  serverExternalPackages: ["@cursor/sdk"],
  // Templates are read from disk at runtime rather than imported, so they stay
  // openable in a real SVG editor. Tracing has to be told they ship.
  outputFileTracingIncludes: {
    "/api/**": ["./lib/templates/*.svg"],
  },
};

export default nextConfig;
