import { SiteRenderer } from "./site-renderer";
import { libraryFallback } from "./library-fallback";
import type { EditorSite } from "./editor-model";
import "@/app/globals.css";

export type ExportPage = { site: EditorSite; files: Record<string, string>; filename: string };

export function ExportContent({ site, files }: ExportPage) {
  return <SiteRenderer sections={site.schema_json} pages={site.pages} siteId={site.site_id}
    siteSlug={site.slug} themeConfig={site.theme_config} fallback={libraryFallback(site.name)}
    pagePath={page => files[page.id] || "index.html"} />;
}
