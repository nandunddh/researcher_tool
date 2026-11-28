import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

const PAGES: [path: string, priority: number][] = [["/", 1], ["/pricing", 0.9], ["/demo", 0.8], ["/signup", 0.7], ["/login", 0.4], ["/terms", 0.3], ["/privacy", 0.3]];

/** The public marketing pages. Published event sites are left out (they belong to each organiser). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await siteUrl();
  return PAGES.map(([path, priority]) => ({ url: base + path, changeFrequency: "weekly", priority }));
}
