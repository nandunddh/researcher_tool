import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/** Public pages and published event sites may be indexed; signed-in areas and the API may not. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await siteUrl();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/root/", "/billing", "/setup-2fa", "/organization", "/client", "/conference", "/receipt/"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
