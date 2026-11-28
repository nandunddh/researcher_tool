import { headers } from "next/headers";

const HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i;

/** The public origin, e.g. "https://sciprospect.aclclouds.online": SCIPROSPECT_SITE_URL when set, else the host the visitor used
 *  (from the proxy's X-Forwarded-* headers), so previews, robots and the sitemap work on any domain without a build setting. */
export function originFrom(configured: string | undefined, get: (name: string) => string | null): string {
  const set = (configured || "").trim().replace(/\/+$/, "");
  if (/^https?:\/\/[^/\s]+$/i.test(set)) return set;
  const host = (get("x-forwarded-host") || get("host") || "").split(",")[0].trim();
  if (!HOST.test(host)) return "http://localhost:3000"; // missing or malformed host: never echo it into links
  const proto = (get("x-forwarded-proto") || "").split(",")[0].trim().toLowerCase();
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  return `${proto === "http" || proto === "https" ? proto : local ? "http" : "https"}://${host}`;
}

export async function siteUrl(): Promise<string> {
  const list = await headers();
  return originFrom(process.env.SCIPROSPECT_SITE_URL, (name) => list.get(name));
}
