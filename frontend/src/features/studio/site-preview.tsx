"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { prepareSite, switchPage, type EditorSite } from "./editor-model";
import { libraryFallback } from "./library-fallback";
import type { PageRef } from "./site-schema";
import { SiteRenderer } from "./site-renderer";

const slugOf = (p: PageRef) => (p.slug || "").replace(/^\/+|\/+$/g, "");

/** Full-page preview of the saved website, drawn by the same renderer as the
 *  editor canvas. `?page=<address>` opens another page; links between pages stay here. */
export function SitePreview({ siteId, pageSlug }: { siteId: string; pageSlug?: string }) {
  const [site, setSite] = useState<EditorSite | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    api<EditorSite>(`/api/builder/sites/${encodeURIComponent(siteId)}`, { signal: abort.signal })
      .then(raw => {
        let prepared = prepareSite(raw);
        const wanted = pageSlug || new URLSearchParams(window.location.search).get("page");
        const page = wanted && prepared.pages?.find(p => slugOf(p) === wanted || p.id === wanted)
          || prepared.pages?.find(p => p.is_home) || prepared.pages?.[0];
        if (page && page.id !== prepared.active_page_id) prepared = switchPage(prepared, page.id);
        setSite(prepared);
        document.title = `${page && !page.is_home ? `${page.name} · ` : ""}${prepared.name} · Preview`;
      })
      .catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "This website could not be opened."); });
    return () => abort.abort();
  }, [siteId, pageSlug]);
  const fallback = useMemo(() => libraryFallback(site?.name), [site?.name]);
  // Preview addresses mirror the live site: …/preview for home, …/preview/<page address> for others.
  const pagePath = useCallback((p: PageRef) => `/${window.location.pathname.split("/")[1]}/scistudio/${encodeURIComponent(siteId)}/preview${p.is_home || !slugOf(p) ? "" : `/${encodeURIComponent(slugOf(p))}`}`, [siteId]);

  if (error) return <p role="alert" style={{ padding: 32, font: "15px system-ui" }}>{error}</p>;
  if (!site) return <p role="status" style={{ padding: 32, font: "15px system-ui", color: "#5d6b82" }}>Opening preview…</p>;
  if (!site.schema_json.length) return <p style={{ padding: 32, font: "15px system-ui" }}>This page is empty. Add sections in the editor and save.</p>;
  return (
    <div style={{ minHeight: "100vh", background: "white" }}>
      <SiteRenderer themeConfig={site.theme_config} sections={site.schema_json} pages={site.pages} siteSlug={site.slug} siteId={site.site_id} fallback={fallback} pagePath={pagePath} />
    </div>
  );
}
