import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Script from "next/script";
import { prepareSite, type EditorSite } from "@/features/studio/editor-model";
import { PublishedSite } from "@/features/studio/published-site";
import { readSeo, seoProblems } from "@/features/studio/seo-settings";
import { safeImage } from "@/features/studio/site-schema";

type Params = { slug: string; page?: string[] };
type Props = { params: Promise<Params> };

async function load({ slug, page = [] }: Params) {
  if (page.length > 1) notFound();
  const origin = process.env.FASTAPI_ORIGIN || "http://127.0.0.1:8000";
  const path = [slug, ...page].map(encodeURIComponent).join("/");
  const response = await fetch(origin + "/api/public/sites/" + path, { cache: "no-store" });
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error("Could not load the published website.");
  return await response.json() as EditorSite & { page_name?: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const site = await load(await params);
  const seo = readSeo(site);
  const title = seo.meta_title || [site.page_name, site.name].filter(Boolean).join(" · ");
  const image = safeImage(seo.og_image);
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") === "http" ? "http" : "https";
  const metadataBase = host && /^[a-z0-9.-]+(?::[0-9]+)?$/i.test(host) ? new URL(protocol + "://" + host) : undefined;
  return {
    metadataBase, title, description: seo.meta_description || null, keywords: seo.meta_keywords || null,
    robots: typeof site.meta_config === "object" && site.meta_config && "robots" in site.meta_config
      && typeof site.meta_config.robots === "string" ? site.meta_config.robots : "index, follow",
    alternates: seo.canonical_url && !seoProblems(seo).canonical_url ? { canonical: seo.canonical_url } : undefined,
    openGraph: { title, description: seo.meta_description, images: image ? [image] : [] },
  };
}

export default async function Page({ params }: Props) {
  const raw = await load(await params);
  const seo = readSeo(raw);
  const id = seo.ga_tracking_id.toUpperCase();
  return <>
    <PublishedSite site={prepareSite(raw)} />
    {id && !seoProblems(seo).ga_tracking_id && <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
      <Script id="site-analytics" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${id}');`}</Script>
    </>}
  </>;
}
