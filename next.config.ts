import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: false },
  // @cursor/sdk ships a .LICENSE.txt next to its ESM chunks that Turbopack cannot
  // classify. It only ever runs server-side, so keep it out of the bundle graph.
  serverExternalPackages: ["@cursor/sdk"],
};

export default nextConfig;
