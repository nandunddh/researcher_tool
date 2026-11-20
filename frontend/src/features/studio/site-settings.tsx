"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "@/components/icon";
import { uploadImage } from "./media";
import { limits, readSeo, searchSnippet, seoPayload, seoProblems, type SeoSettings } from "./seo-settings";
import styles from "./react-editor.module.css";

type Tab = "search" | "social" | "analytics";
type SiteRecord = { site_id: string; name: string; slug?: string; status?: string; meta_config?: unknown; [key: string]: unknown };

function Counter({ value, ideal, max }: { value: string; ideal: number; max: number }) {
  const n = value.length;
  const state = n === 0 ? "empty" : n <= ideal ? "good" : n <= max ? "long" : "over";
  const note = state === "good" ? "Good length" : state === "long" ? "May be cut off in Google" : state === "over" ? "Too long" : "Not set";
  return <small className={styles.counter} data-state={state}>{n} / {ideal} · {note}</small>;
}

/** Search (SEO), social sharing and Google Analytics. Saves on its own, so it
 *  also works for published websites and never touches unsaved page changes. */
export function SiteSettings({ siteId, onClose, onSaved }: { siteId: string; onClose: () => void; onSaved: (message: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [site, setSite] = useState<SiteRecord | null>(null);
  const [form, setForm] = useState<SeoSettings | null>(null);
  const [tab, setTab] = useState<Tab>("search");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const endpoint = `/api/builder/sites/${encodeURIComponent(siteId)}`;

  useEffect(() => {
    ref.current?.showModal();
    const abort = new AbortController();
    api<SiteRecord>(endpoint, { signal: abort.signal })
      .then(s => { setSite(s); setForm(readSeo(s)); })
      .catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Settings could not be loaded."); });
    return () => abort.abort();
  }, [endpoint]);

  const problems = form ? seoProblems(form) : {};
  const blocked = Object.keys(problems).length > 0;
  const set = <K extends keyof SeoSettings>(key: K, value: SeoSettings[K]) => setForm(f => (f ? { ...f, [key]: value } : f));
  const changed = !!(site && form && JSON.stringify(readSeo(site)) !== JSON.stringify(form));

  async function save() {
    if (!site || !form || blocked) return;
    setBusy(true); setError("");
    try {
      await api(endpoint, { method: "PUT", body: JSON.stringify(seoPayload(site, form)) });
      onSaved(site.status === "published" ? "Settings saved. Your live website is updated." : "Settings saved.");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Settings could not be saved.");
    } finally { setBusy(false); }
  }

  async function pickImage(f?: File) {
    if (!f) return;
    setUploading(true); setError("");
    try { set("og_image", await uploadImage(siteId, f)); }
    catch (e) { setError(e instanceof Error ? e.message : "The image could not be uploaded."); }
    finally { setUploading(false); if (file.current) file.current.value = ""; }
  }

  const snippet = form ? searchSnippet(form, site?.name ?? "") : null;
  const address = site?.slug ? `${typeof window !== "undefined" ? window.location.host : ""}/sites/${site.slug}` : "";
  const problem = (key: keyof SeoSettings) => problems[key] && <p className={styles.problem} role="alert">{problems[key]}</p>;

  return (
    <dialog ref={ref} className={styles.settings} aria-labelledby="site-settings-title"
      onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
      <header className={styles.settingsHead}>
        <div>
          <h2 id="site-settings-title">Site settings</h2>
          <p className={styles.hint}>How your website appears in Google, when shared, and how visits are measured.</p>
        </div>
        <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close settings" disabled={busy}><Icon name="close" size={16} /></button>
      </header>

      <div className={styles.panelTabs} role="tablist" aria-label="Settings sections">
        <button type="button" role="tab" aria-selected={tab === "search"} onClick={() => setTab("search")}><Icon name="search" size={14} /> Search (SEO)</button>
        <button type="button" role="tab" aria-selected={tab === "social"} onClick={() => setTab("social")}><Icon name="external" size={14} /> Social sharing</button>
        <button type="button" role="tab" aria-selected={tab === "analytics"} onClick={() => setTab("analytics")}><Icon name="bolt" size={14} /> Analytics</button>
      </div>

      <div className={styles.settingsBody}>
        {error && <p className={styles.alert} role="alert">{error}</p>}
        {!form || !site ? (!error && <p className={styles.hint}>Loading settings…</p>) : <>
          {site.status === "published" && <p className={styles.scope} data-screen="tablet">This website is live. Saved changes appear on it right away.</p>}

          {tab === "search" && <>
            <div className={styles.googlePreview} aria-label="Google search preview">
              <small>Preview in Google search</small>
              <span className={styles.gUrl}>{address || "your-website"}</span>
              <span className={styles.gTitle}>{snippet?.title}</span>
              <span className={styles.gDesc}>{snippet?.description}</span>
            </div>
            <label className={styles.field}>
              <span>Page title</span>
              <input value={form.meta_title} placeholder={site.name} maxLength={limits.maxTitle + 20} onChange={e => set("meta_title", e.target.value)} />
              <Counter value={form.meta_title} ideal={limits.title} max={limits.maxTitle} />
              <small>Shown as the blue link in Google and on the browser tab. Leave empty to use “{site.name}”.</small>
            </label>
            {problem("meta_title")}
            <label className={styles.field}>
              <span>Description</span>
              <textarea rows={3} value={form.meta_description} maxLength={limits.maxDescription + 50}
                placeholder="For example: The International Conference on AI & ML 2027 — 3 days of keynotes, workshops and posters in Berlin."
                onChange={e => set("meta_description", e.target.value)} />
              <Counter value={form.meta_description} ideal={limits.description} max={limits.maxDescription} />
            </label>
            {problem("meta_description")}
            <label className={styles.field}>
              <span>Keywords</span>
              <input value={form.meta_keywords} placeholder="AI conference, machine learning, 2027" onChange={e => set("meta_keywords", e.target.value)} />
              <small>Optional. Separate with commas.</small>
            </label>
            {problem("meta_keywords")}
            <label className={styles.check}>
              <input type="checkbox" checked={form.indexable} onChange={e => set("indexable", e.target.checked)} />
              Let search engines show this website
            </label>
            {!form.indexable && <p className={styles.scope} data-screen="tablet">Google will be asked not to list this website.</p>}
            <details className={styles.more}>
              <summary>Advanced</summary>
              <label className={styles.field}>
                <span>Main address (canonical URL)</span>
                <input value={form.canonical_url} placeholder="https://www.aiml2027.org" inputMode="url" onChange={e => set("canonical_url", e.target.value)} />
                <small>Only needed if this website is also reachable at your own domain.</small>
              </label>
              {problem("canonical_url")}
            </details>
          </>}

          {tab === "social" && <>
            <p className={styles.hint}>This image and text appear when someone shares your link on LinkedIn, WhatsApp, X or Facebook.</p>
            <div className={styles.shareCard}>
              {form.og_image ? <img src={form.og_image} alt="" /> : <div className={styles.thumbEmpty}>No share image yet</div>}
              <div>
                <strong>{snippet?.title}</strong>
                <span>{snippet?.description}</span>
                <small>{address}</small>
              </div>
            </div>
            <div className={styles.buttonRow}>
              <button type="button" disabled={uploading} onClick={() => file.current?.click()}>{uploading ? "Uploading…" : form.og_image ? "Replace image" : "Upload image"}</button>
              {form.og_image && <button type="button" onClick={() => set("og_image", "")}>Remove</button>}
            </div>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={e => void pickImage(e.target.files?.[0])} />
            <small className={styles.hint}>Best size: 1200 × 630 pixels.</small>
            {problem("og_image")}
          </>}

          {tab === "analytics" && <>
            <label className={styles.field}>
              <span>Google Analytics measurement ID</span>
              <input value={form.ga_tracking_id} placeholder="G-AB12CD34EF" spellCheck={false} autoCapitalize="characters"
                onChange={e => set("ga_tracking_id", e.target.value.replace(/\s/g, ""))} />
              <small>Counts visits to your published website. Find it in Google Analytics → Admin → Data streams → your stream.</small>
            </label>
            {problem("ga_tracking_id")}
            {form.ga_tracking_id && !problems.ga_tracking_id && (
              <p className={styles.scope}><Icon name="check" size={13} /> Analytics will be added to your published website.</p>
            )}
            <p className={styles.hint}>Visits from the editor and the preview page are not counted.</p>
          </>}
        </>}
      </div>

      <footer className={styles.settingsFoot}>
        <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className={styles.save} disabled={!changed || blocked || busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save settings"}
        </button>
      </footer>
    </dialog>
  );
}
