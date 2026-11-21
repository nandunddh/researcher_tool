"use client";
import type { EditorSite } from "./editor-model";
import { libraryFallback } from "./library-fallback";
import { SiteRenderer } from "./site-renderer";

export function PublishedSite({ site }: { site: EditorSite }) {
  return <SiteRenderer sections={site.schema_json} pages={site.pages} themeConfig={site.theme_config}
    siteId={site.site_id} siteSlug={site.slug} fallback={libraryFallback(site.name)} />;
}
