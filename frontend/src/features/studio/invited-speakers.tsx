"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import styles from "./event-details.module.css";

type Invited = { email: string; name: string; affiliation: string; orcid: string; source: string; paper_title: string };
type Rec = Record<string, unknown>;
const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
/** Affiliations from OpenAlex are "Institution | Department | …": the institution is the first part. */
const institution = (affiliation: string) => affiliation.split(" | ")[0].trim();
const message = (error: unknown) => error instanceof Error ? error.message : "Please try again.";

/** Researchers sent from the SciProspect collector. Private: only people added here to the speakers appear on the website. */
export function InvitedSpeakers({ siteId, speakers, readOnly, onAdd, onError }: {
  siteId: string; speakers: Rec[]; readOnly: boolean; onAdd: (speaker: { name: string; affiliation: string }) => void; onError: (message: string) => void;
}) {
  const [items, setItems] = useState<Invited[] | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<{ invited: Invited[] }>(`/api/builder/sites/${siteId}/shortlist`, { signal: controller.signal })
      .then(r => { if (!controller.signal.aborted) setItems(r.invited); })
      .catch(e => { if (!controller.signal.aborted) { setItems([]); onError(message(e)); } });
    return () => controller.abort();
  }, [siteId, reload]);
  const onSite = new Set(speakers.map(s => norm(s.name)));
  async function remove(item: Invited) {
    try { await api(`/api/builder/sites/${siteId}/shortlist/${encodeURIComponent(item.email)}`, { method: "DELETE" }); setReload(v => v + 1); }
    catch (e) { onError(message(e)); }
  }

  return (
    <div className={styles.invited}>
      <h3>Invited speakers</h3>
      <p className={styles.intro}>Researchers you sent from SciProspect. This list is private. Only people you add to the website below appear on it, and no email is sent from here.</p>
      {items === null && <p className={styles.intro}>Loading…</p>}
      {items !== null && !items.length && <p className={styles.intro}>No one yet. In SciProspect, select researchers in the Leads Explorer and choose “Add to event”.</p>}
      {items !== null && items.length > 0 && (
        <ul className={styles.invitedList}>
          {items.map(item => (
            <li key={item.email}>
              <div>
                <strong>{item.name}</strong>
                <small title={item.affiliation}>{institution(item.affiliation) || "No affiliation"}</small>
                <small>{item.email}{item.source ? ` · ${item.source}` : ""}</small>
              </div>
              {onSite.has(norm(item.name))
                ? <span className={styles.onSite}>On the website</span>
                : <button type="button" disabled={readOnly} onClick={() => onAdd({ name: item.name, affiliation: institution(item.affiliation) })}>Add to website</button>}
              <button type="button" disabled={readOnly} onClick={() => void remove(item)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
