"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ConfirmDialog } from "@/components/confirm-dialog";
import styles from "./collector.module.css";

export type SavedSearch = { id: string; name: string; kind: "publications" | "nih"; topic: string; target: number; min_score: number;
  window_days: number; country: string; institution: string; frequency: "off" | "daily" | "weekly";
  next_run_at: string | null; last_run_at: string | null; last_error: string };

const when = (iso: string | null) => iso ? new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const message = (error: unknown) => error instanceof Error ? error.message : "Please try again.";

/** Saved searches for this collector page (publications or NIH): run now, schedule daily/weekly, delete. */
export function SavedSearches({ kind, revision, busy, onStarted, onError }: {
  kind: "publications" | "nih"; revision: number; busy: boolean; onStarted: (runId: string) => void; onError: (text: string) => void;
}) {
  const [items, setItems] = useState<SavedSearch[]>([]);
  const [reload, setReload] = useState(0);
  const [deleting, setDeleting] = useState<SavedSearch | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    api<SavedSearch[]>("/api/collector/searches", { signal: controller.signal })
      .then(all => { if (!controller.signal.aborted) setItems(all.filter(s => s.kind === kind)); })
      .catch(e => { if (!controller.signal.aborted) onError(message(e)); });
    return () => controller.abort();
  }, [kind, revision, reload]);

  async function runNow(item: SavedSearch) {
    try { const { id } = await api<{ id: string }>(`/api/collector/searches/${item.id}/run`, { method: "POST" }); onStarted(id); setReload(v => v + 1); }
    catch (e) { onError(message(e)); }
  }
  async function schedule(item: SavedSearch, frequency: SavedSearch["frequency"]) {
    try { await api(`/api/collector/searches/${item.id}`, { method: "PATCH", body: JSON.stringify({ frequency }) }); setReload(v => v + 1); }
    catch (e) { onError(message(e)); }
  }
  async function remove(item: SavedSearch) {
    try { await api(`/api/collector/searches/${item.id}`, { method: "DELETE" }); setDeleting(null); setReload(v => v + 1); }
    catch (e) { onError(message(e)); setDeleting(null); }
  }

  if (!items.length) return null;
  return (
    <section className={styles.card} id="saved">
      <div className={styles.cardTop}><h3 className={styles.h3}>Saved searches</h3><span className={styles.muted}>Scheduled searches collect only researchers you don&apos;t have yet</span></div>
      <div className={styles.savedList}>
        {items.map(item => (
          <div key={item.id} className={styles.savedRow}>
            <div className={styles.savedInfo}>
              <strong>{item.name}</strong>
              <small>
                {item.target} contacts · last {item.window_days} days{item.kind === "nih" ? " · NIH grants" : ` · score ${item.min_score}+`}
                {item.country ? ` · ${item.country}` : ""}{item.institution ? ` · ${item.institution}` : ""}
              </small>
              <small className={item.last_error ? styles.savedError : undefined}>
                {item.last_error ? `Last scheduled run didn't start: ${item.last_error}`
                  : item.frequency !== "off" && item.next_run_at ? `Next run ${when(item.next_run_at)}${item.last_run_at ? ` · last ${when(item.last_run_at)}` : ""}`
                  : item.last_run_at ? `Last run ${when(item.last_run_at)}` : "Not run yet"}
              </small>
            </div>
            <label className={styles.savedFreq}>Repeat
              <select value={item.frequency} onChange={e => void schedule(item, e.target.value as SavedSearch["frequency"])}>
                <option value="off">Off</option><option value="daily">Daily</option><option value="weekly">Weekly</option>
              </select>
            </label>
            <button type="button" className={styles.ghost} onClick={() => void runNow(item)} disabled={busy}>Run now</button>
            <button type="button" className={styles.ghost} onClick={() => setDeleting(item)}>Delete</button>
          </div>
        ))}
      </div>
      {deleting && <ConfirmDialog title="Delete this saved search?" description={`"${deleting.name}" and its schedule will be removed. Collections it already made stay in the Datasets Archive.`}
        label="Delete saved search" busy={false} onConfirm={() => void remove(deleting)} onCancel={() => setDeleting(null)} />}
    </section>
  );
}
