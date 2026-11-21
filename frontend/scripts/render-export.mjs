import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const folder = await mkdtemp(join(tmpdir(), "scistudio-export-"));
try {
  const options = {
    bundle: true, jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
    external: ["/branding/*"], minifyWhitespace: true, logLevel: "silent",
  };
  const [, client] = await Promise.all([
    build({ ...options, entryPoints: ["src/features/studio/export-server.tsx"], platform: "node",
      format: "cjs", outfile: join(folder, "renderer.cjs") }),
    build({ ...options, entryPoints: ["src/features/studio/export-client.tsx"], platform: "browser",
      outfile: join(folder, "site.js"), write: false }),
  ]);
  const { renderPage } = createRequire(import.meta.url)(join(folder, "renderer.cjs"));
  process.stdin.setEncoding("utf8");
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const files = Object.fromEntries(JSON.parse(input).map(page => [page.filename, renderPage(page)]));
  files["style.css"] = client.outputFiles.find(file => file.path.endsWith(".css")).text;
  files["site.js"] = client.outputFiles.find(file => file.path.endsWith(".js")).text;
  process.stdout.write(JSON.stringify(files));
} finally {
  await rm(folder, { recursive: true, force: true });
}
