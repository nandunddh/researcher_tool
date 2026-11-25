"use client";
import { useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import { api } from "@/lib/api";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Modal } from "@/components/modal";
import { PasswordInput } from "@/components/password-input";
import { Icon } from "@/components/icon";

export type Member = { member_id: string; name: string; email: string; role: string; scistudio_access: boolean; created_at?: string };

/** The owner's team: add and remove people up to the seats the plan includes. Members share the owner's collector and websites. */
export function TeamPanel({ members, seatLimit, onChanged }: { members: Member[]; seatLimit: number; onChanged: () => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);
  const full = members.length >= seatLimit;

  async function run(path: string, body: unknown, done: string, after: () => void) {
    setBusy(true);
    try { await api(path, { method: "POST", body: JSON.stringify(body) }); toast.success(done); after(); await onChanged(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Something went wrong."); }
    finally { setBusy(false); }
  }
  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run("/api/organization/team/add", { name: f.get("name"), email: f.get("email"), role: f.get("role"), password: f.get("password") || undefined, scistudio_access: f.has("studio") },
      "Team member added.", () => setAdding(false));
  }

  return (
    <section className="account-panel" style={{ marginTop: "1.5rem" }}>
      <div className="toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: "1.1rem", margin: 0, fontWeight: 600 }}>Team ({members.length}/{seatLimit})</h2>
          <small style={{ color: "var(--text-secondary, #64748b)" }}>
            {seatLimit === 0 ? "Your plan has no team seats. Choose a plan with more users on the Billing page."
              : "Team members share your contacts and websites. Each has their own daily contact limit."}
          </small>
        </div>
        <button type="button" className="primary" disabled={busy || full} onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Add team member</button>
      </div>
      {members.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Member</th><th>Email</th><th>Role</th><th>Actions</th></tr></thead>
            <tbody>
              {members.map(m => (
                <tr key={m.member_id}>
                  <td data-label="Member"><strong>{m.name}</strong></td>
                  <td data-label="Email">{m.email}</td>
                  <td data-label="Role"><span className="badge">{m.role.toUpperCase()}</span></td>
                  <td data-label="Actions"><button type="button" className="danger" disabled={busy} onClick={() => setRemoving(m)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {adding && (
        <Modal title="Add team member" onClose={() => setAdding(false)}>
          <form onSubmit={add}>
            <div className="form-grid">
              <label>Name<input name="name" required placeholder="e.g. Dr. Jane Smith" /></label>
              <label>Email<input name="email" type="email" required placeholder="jane@lab.org" /></label>
              <label>Role
                <select name="role" defaultValue="editor">
                  <option value="admin">Admin</option><option value="editor">Editor</option><option value="viewer">Viewer (can look, not change)</option>
                </select>
              </label>
              <label>Password<PasswordInput name="password" autoComplete="new-password" required minLength={8} placeholder="They sign in with this" /></label>
              <label className="inline-label"><input type="checkbox" name="studio" defaultChecked />Can use SciStudio</label>
            </div>
            <div className="modal-actions">
              <button type="button" disabled={busy} onClick={() => setAdding(false)}>Cancel</button>
              <button className="primary" disabled={busy}>{busy ? "Adding…" : "Add member"}</button>
            </div>
          </form>
        </Modal>
      )}
      {removing && (
        <ConfirmDialog title="Remove team member?" description={`Remove ${removing.name} (${removing.email})? They will lose access to your contacts and websites.`} label="Remove member" busy={busy}
          onCancel={() => setRemoving(null)}
          onConfirm={() => { if (!busy) void run("/api/organization/team/remove", { member_id: removing.member_id }, "Team member removed.", () => setRemoving(null)); }} />
      )}
    </section>
  );
}
