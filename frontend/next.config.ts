import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import pkg from "./package.json";

const backend = process.env.FASTAPI_ORIGIN || "http://127.0.0.1:8000";

/** The commit this build was made from (shown with the version in the sidebar); empty when git is not available. */
function commit(): string {
  try { return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; }
}

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version, NEXT_PUBLIC_APP_COMMIT: commit() },
  // Workspace pages moved from /{account type}/... to one address for everyone; old links and bookmarks keep working.
  // Not permanent (307), so browsers do not cache them forever. /root/dashboard and the other root admin pages stay.
  async redirects() {
    return [
      { source: "/:ns(client|organization|conference)/dashboard", destination: "/dashboard", permanent: false },
      { source: "/:ns(client|organization|conference|root)/collector/:path*", destination: "/collector/:path*", permanent: false },
      { source: "/:ns(client|organization|conference|root)/scistudio/:path*", destination: "/scistudio/:path*", permanent: false },
    ];
  },
  async rewrites() {
    // Browser requests stay on one origin; FastAPI owns authorization and sessions. Every backend route lives under /api,
    // so any other unknown address gets the app's own "Page not found" page (src/app/not-found.tsx).
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};
export default config;
