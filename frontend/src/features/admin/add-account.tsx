"use client";
import { useState, type FormEvent } from "react";
import { toast } from "react-toastify";
import { PasswordInput } from "@/components/password-input";
import { createAccount } from "./requests";
import { AdminShell } from "./shell";

export function AddAccount() {
  const [tier, setTier] = useState("trial");
  const [kind, setKind] = useState("single");
  const [durationDays, setDurationDays] = useState("7");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await createAccount(data, kind);
      window.location.assign("/root/accounts?created=1");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create account";
      setError(message);
      toast.error(message);
      setBusy(false);
    }
  }

  return (
    <AdminShell title="Add Account" path="/root/add-account">
      <form className="account-panel account-form" onSubmit={submit}>
        {error && <p className="alert" role="alert">{error}</p>}
        <div className="form-grid">
          <label>
            Account type
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="single">Individual client</option>
              <option value="org">Organization</option>
            </select>
          </label>
          <label>
            Client / owner name
            <input name="name" required autoComplete="name" />
          </label>
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            Password (optional)
            <PasswordInput name="password" autoComplete="new-password" />
          </label>
          {kind === "org" && (
            <>
              <label>
                Organization name
                <input name="org_name" required />
              </label>
              <label>
                Team seats
                <input name="seat_limit" type="number" min="1" defaultValue="5" required />
              </label>
            </>
          )}
          <label>
            Plan
            <select name="tier" value={tier} onChange={(e) => setTier(e.target.value)}>
              <option value="trial">Trial</option>
              <option value="pro">Pro - Monthly (30 days)</option>
            </select>
          </label>
          {tier === "pro" ? (
            <div>
              <strong>Monthly validity</strong>
              <p>30 days from activation. Renewal is managed manually for now.</p>
            </div>
          ) : (
            <label>
              Trial validity (days)
              <input
                name="duration_days"
                type="number"
                min="1"
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                required
              />
            </label>
          )}
          <label>
            Daily contact limit
            <input name="daily_limit" type="number" min="-1" defaultValue="1000" required />
            <small>Use -1 for unlimited.</small>
          </label>
          <label>
            Internal note
            <input name="notes" />
          </label>
          <label className="inline-label">
            <input name="studio" type="checkbox" defaultChecked />
            Enable SciStudio
          </label>
        </div>
        <div className="modal-actions">
          <a className="button" href="/root/accounts">
            Cancel
          </a>
          <button className="primary" disabled={busy}>
            {busy ? "Creating..." : "Create account"}
          </button>
        </div>
      </form>
    </AdminShell>
  );
}
