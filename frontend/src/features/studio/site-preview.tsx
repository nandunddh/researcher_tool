"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { prepareSite, type EditorSite } from "./editor-model";
import { libraryFallback } from "./library-fallback";
import { SiteRenderer } from "./site-renderer";

/** Full-page preview of the saved website, drawn by the same renderer as the
 *  editor canvas so both always look identical. */
export function SitePreview({ siteId }: { siteId: string }) {
  const [site, setSite] = useState<EditorSite | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    api<EditorSite>(`/api/builder/sites/${encodeURIComponent(siteId)}`, { signal: abort.signal })
      .then(raw => { const prepared = prepareSite(raw); setSite(prepared); document.title = `${prepared.name} · Preview`; })
      .catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "This website could not be opened."); });
    return () => abort.abort();
  }, [siteId]);
  const fallback = useMemo(() => libraryFallback(site?.name), [site?.name]);

  if (error) return <p role="alert" style={{ padding: 32, font: "15px system-ui" }}>{error}</p>;
  if (!site) return <p role="status" style={{ padding: 32, font: "15px system-ui", color: "#5d6b82" }}>Opening preview…</p>;
  if (!site.schema_json.length) return <p style={{ padding: 32, font: "15px system-ui" }}>This page is empty. Add sections in the editor and save.</p>;
  return (
    <div style={{ minHeight: "100vh", background: "white" }}>
      <SiteRenderer sections={site.schema_json} pages={site.pages} siteSlug={site.slug} fallback={fallback} />
    </div>
  );
}
