import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Browsers and raw pages (robots.txt, sitemap.xml) ask for /favicon.ico; serve the site's favicon (PNG works everywhere).
export async function GET() {
  const png = await readFile(join(process.cwd(), "public/branding/sciprospect-a-favicon-64.png"));
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
}
