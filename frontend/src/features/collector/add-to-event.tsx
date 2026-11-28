"use client";
import { useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { api } from "@/lib/api";
import styles from "./collector.module.css";

type SiteRef = { site_id: string; name: string };
type Counts = { added: number; already_listed: number; not_found: number };
const message = (error: unknown) => error instanceof Error ? error.message : "Please try again.";
const BATCH = 200; // the API takes at most 200 addresses per request

/** Adds researchers from the Leads Explorer to an event's private "Invited speakers" list in SciStudio. */
export function AddToEvent({ emails, namespace, onClose }: { emails: string[]; namespace: string; onClose: () => void }) {
  const [sites, setSites] = useState<SiteRef[] | null>(null);
  const [siteId, setSiteId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Counts | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api<{ sites: SiteRef[] }>("/api/builder/sites", { signal: controller.signal })
      .then(({ sites }) => { setSites(sites); setSiteId(sites[0]?.site_id ?? ""); })
      .catch(e => { if (!controller.signal.aborted) setError(message(e)); });
    return () => controller.abort();
  }, []);

  async function send() {
    setBusy(true); setError("");
    const total: Counts = { added: 0, already_listed: 0, not_found: 0 };
    try {
      for (let i = 0; i < emails.length; i += BATCH) {
        const part = await api<Counts>(`/api/builder/sites/${siteId}/shortlist`, { method: "POST", body: JSON.stringify({ emails: emails.slice(i, i + BATCH) }) });
        total.added += part.added; total.already_listed += part.already_listed; total.not_found += part.not_found;
      }
      setDone(total);
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }

  const eventName = sites?.find(s => s.site_id === siteId)?.name ?? "the event";
  return (
    <Modal title="Add to an event" onClose={onClose}>
      {done ? (
        <div className={styles.dialogBody}>
          <p role="status"><strong>{done.added} added</strong> to the Invited speakers of “{eventName}”.
            {done.already_listed > 0 && ` ${done.already_listed} already on the list.`}{done.not_found > 0 && ` ${done.not_found} not found in your archive.`}</p>
          <p className={styles.muted}>They are private. Open the event in SciStudio, then Event details → Speakers, to add the ones who accept to the website.</p>
          <div className={styles.dialogActions}><a className="primary" href="/scistudio">Open SciStudio</a><button type="button" onClick={onClose}>Close</button></div>
        </div>
      ) : (
        <div className={styles.dialogBody}>
          <p>Add <strong>{emails.length}</strong> researcher{emails.length === 1 ? "" : "s"} to an event&apos;s <strong>Invited speakers</strong> list.</p>
          <p className={styles.muted}>The list is private: nothing is shown on the website, and no email is sent. You choose who to add to the speakers later.</p>
          {error && <p className={styles.alert} role="alert">{error}</p>}
          {sites === null && !error && <p className={styles.muted}>Loading your events…</p>}
          {sites !== null && !sites.length && <p className={styles.muted}>You have no websites yet. Create an event in SciStudio first.</p>}
          {sites !== null && sites.length > 0 && (
            <label className={styles.field}>Event
              <select value={siteId} onChange={e => setSiteId(e.target.value)} disabled={busy}>{sites.map(s => <option key={s.site_id} value={s.site_id}>{s.name}</option>)}</select>
            </label>
          )}
          <div className={styles.dialogActions}>
            <button type="button" className="primary" onClick={() => void send()} disabled={busy || !siteId || !emails.length}>{busy ? "Adding…" : `Add ${emails.length}`}</button>
            <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
