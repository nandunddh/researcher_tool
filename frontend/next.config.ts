import type { NextConfig } from "next";

const backend = process.env.FASTAPI_ORIGIN || "http://127.0.0.1:8000";
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async rewrites() {
    return {
      // Browser requests stay on one origin; FastAPI owns authorization and sessions.
      beforeFiles: [
        { source: "/api/:path*", destination: `${backend}/api/:path*` },
        { source: "/sites/:path*", destination: `${backend}/sites/:path*` },
      ],
      // Existing editor/admin/collector remain functional during incremental migration.
      fallback: [{ source: "/:path*", destination: `${backend}/:path*` }],
    };
  },
};
export default config;
