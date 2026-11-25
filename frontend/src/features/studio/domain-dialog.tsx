"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import { api } from "@/lib/api";
import { Modal } from "@/components/modal";
import { ConfirmDialog } from "@/components/confirm-dialog";

type DnsRecord = { purpose: "verify" | "route"; type: string; name: string; value: string; note: string };
type DomainView = { allowed: boolean; message: string | null; domain: { hostname: string; verified: boolean; pointing: boolean; records: DnsRecord[] } | null };

const path = (siteId: string) => `/api/builder/sites/${encodeURIComponent(siteId)}/domain`;
const post = (url: string, method: string, body?: unknown) => api<DomainView>(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });

/** A website's own domain: the DNS records to add, and a check that they are in place. */
export function DomainDialog({ site, onClose }: { site: { site_id: string; name: string }; onClose: () => void }) {
  const [view, setView] = useState<DomainView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => { api<DomainView>(path(site.site_id)).then(setView).catch(err => setError(err instanceof Error ? err.message : "Could not load the domain.")); }, [site.site_id]);

  const run = useCallback(async (job: () => Promise<DomainView | void>, done?: string) => {
    setBusy(true); setError("");
    try { const next = await job(); if (next) setView(next); if (done) toast.success(done); return true; }
    catch (err) { setError(err instanceof Error ? err.message : "Something went wrong."); return false; }
    finally { setBusy(false); }
  }, []);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const hostname = String(new FormData(e.currentTarget).get("hostname") ?? "");
    if (await run(() => post(path(site.site_id), "PUT", { hostname }))) setEditing(false);
  }
  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast.success("Copied."); } catch { toast.error("Copy is not available here. Select the text instead."); }
  }

  const domain = view?.domain ?? null;
  return (
    <Modal title={`Your own domain · ${site.name}`} onClose={() => { if (!busy) onClose(); }} wide>
      {error && <p role="alert" className="alert">{error}</p>}
      {!view ? (!error && <p role="status">Loading…</p>) : !view.allowed ? (
        <>
          <p>{view.message}</p>
          <div className="modal-actions"><button type="button" onClick={onClose}>Close</button><a className="button primary" href="/billing">See plans</a></div>
        </>
      ) : !domain || editing ? (
        <form onSubmit={save}>
          <label>Domain name
            <input name="hostname" required autoFocus defaultValue={domain?.hostname ?? ""} placeholder="events.myuniversity.edu" autoComplete="off" spellCheck={false} />
          </label>
          <p style={{ color: "var(--muted, #64748b)" }}>Use a domain you own, written without https://. We will show you the DNS records to add at your domain provider.</p>
          <div className="modal-actions">
            <button type="button" disabled={busy} onClick={() => (domain ? setEditing(false) : onClose())}>Cancel</button>
            <button className="primary" disabled={busy}>{busy ? "Saving…" : "Continue"}</button>
          </div>
        </form>
      ) : (
        <>
          <p><strong>{domain.hostname}</strong>{" "}
            <span className={`badge ${domain.verified ? "published" : "draft"}`}>{domain.verified ? "Ownership verified" : "Ownership not verified yet"}</span>{" "}
            <span className={`badge ${domain.pointing ? "published" : "draft"}`}>{domain.pointing ? "Points to your website" : "Not pointing yet"}</span>
          </p>
          <p>Add these records at your domain provider (where you bought the domain), then choose Check now. DNS changes can take a few minutes, sometimes longer.</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Type</th><th>Name</th><th>Value</th><th aria-label="Copy" /></tr></thead>
              <tbody>
                {domain.records.map(r => (
                  <tr key={`${r.type}-${r.name}`}>
                    <td data-label="Type"><strong>{r.type}</strong></td>
                    <td data-label="Name"><code>{r.name}</code><br /><small>{r.note}</small></td>
                    <td data-label="Value"><code>{r.value}</code></td>
                    <td><button type="button" className="text-button" onClick={() => void copy(r.value)}>Copy value</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ color: "var(--muted, #64748b)" }}>Serving your website on its own domain is switched on by SciProspect once both checks pass.</p>
          <div className="modal-actions">
            <button type="button" className="danger" disabled={busy} onClick={() => setRemoving(true)}>Remove domain</button>
            <button type="button" disabled={busy} onClick={() => setEditing(true)}>Change domain</button>
            <button type="button" className="primary" disabled={busy} onClick={() => void run(() => post(`${path(site.site_id)}/verify`, "POST"), "Checked.")}>{busy ? "Checking…" : "Check now"}</button>
          </div>
        </>
      )}
      {removing && (
        <ConfirmDialog title="Remove this domain?" description={`${domain?.hostname ?? "The domain"} will no longer be linked to this website. You can add it again later.`} label="Remove domain" busy={busy}
          onCancel={() => setRemoving(false)}
          onConfirm={async () => { if (await run(async () => { await api(path(site.site_id), { method: "DELETE" }); setView(v => (v ? { ...v, domain: null } : v)); }, "Domain removed.")) setRemoving(false); }} />
      )}
    </Modal>
  );
}
