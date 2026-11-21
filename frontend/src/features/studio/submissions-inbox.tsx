"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "@/components/icon";
import type { EditorSite } from "./editor-model";
import styles from "./react-editor.module.css";

import { show, toCsv, type Submission } from "./submissions";

/** All form submissions for this website (saved in the database), newest first. */
export function SubmissionsInbox({ site, onClose }: { site: EditorSite; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<Submission[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    ref.current?.showModal();
    api<{ submissions: Submission[] }>(`/api/builder/sites/${encodeURIComponent(site.site_id)}/submissions`)
      .then(r => setRows(r.submissions))
      .catch(e => setError(e instanceof Error ? e.message : "Submissions could not be loaded."));
  }, [site.site_id]);

  const formName = (r: Submission) => {
    for (const p of site.pages ?? [{ id: site.active_page_id ?? "", name: "", schema_json: site.schema_json }]) {
      const s = (p.schema_json ?? []).find(x => x.id === r.form_id);
      if (s) return `${s.title || r.form_type}${p.name ? ` · ${p.name}` : ""}`;
    }
    return r.form_type;
  };
  function download() {
    if (!rows?.length) return;
    const url = URL.createObjectURL(new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${site.slug || "website"}-submissions.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <dialog ref={ref} className={styles.settings} aria-labelledby="inbox-title" onCancel={e => { e.preventDefault(); onClose(); }}>
      <header className={styles.settingsHead}>
        <div>
          <h2 id="inbox-title">Form submissions</h2>
          <p className={styles.hint}>Messages and registrations sent from this website’s forms.</p>
        </div>
        <button type="button" className={styles.iconButton} onClick={onClose} aria-label="Close inbox"><Icon name="close" size={16} /></button>
      </header>
      <div className={styles.settingsBody}>
        {error && <p className={styles.alert} role="alert">{error}</p>}
        {!rows && !error && <p className={styles.hint}>Loading…</p>}
        {rows && !rows.length && <p className={styles.hint}>No submissions yet. They appear here when visitors send a form on your preview or live site.</p>}
        <ul className={styles.inboxList}>
          {rows?.map(r => (
            <li key={r.id}>
              <button type="button" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                <strong>{show(Object.values(r.data)[0]?.value ?? "")}</strong>
                <span>{formName(r)}</span>
                <small>{new Date(r.created_at).toLocaleString()}</small>
              </button>
              {open === r.id && (
                <dl>
                  {Object.entries(r.data).map(([k, f]) => <div key={k}><dt>{f.label}</dt><dd>{show(f.value) || "—"}</dd></div>)}
                </dl>
              )}
            </li>
          ))}
        </ul>
      </div>
      <footer className={styles.settingsFoot}>
        <button type="button" onClick={download} disabled={!rows?.length}>Download CSV</button>
        <button type="button" className={styles.save} onClick={onClose}>Close</button>
      </footer>
    </dialog>
  );
}
