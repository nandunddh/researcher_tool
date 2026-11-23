"use client";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Modal } from "./modal";
import { PasswordInput } from "./password-input";

/** Change your own password: current password, then the new one twice. */
export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ message: string; signedOut: boolean } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const current = String(data.get("current") ?? ""), next = String(data.get("next") ?? ""), repeat = String(data.get("repeat") ?? "");
    if (next.length < 8) { setError("Use at least 8 characters for your new password."); return; }
    if (next !== repeat) { setError("The two new passwords don't match."); return; }
    setBusy(true);
    setError("");
    try {
      const result = await api<{ message: string; signed_out: boolean }>("/api/auth/change-password", {
        method: "POST", body: JSON.stringify({ current_password: current, new_password: next }),
      });
      setDone({ message: result.message, signedOut: result.signed_out });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The password could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Change password" onClose={() => { if (done?.signedOut) window.location.assign("/login"); else onClose(); }}>
      {done ? (
        <>
          <p role="status">{done.message}</p>
          <div className="modal-actions">
            <button type="button" className="primary" onClick={() => done.signedOut ? window.location.assign("/login") : onClose()}>
              {done.signedOut ? "Go to sign in" : "Done"}
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          {error && <p role="alert" className="alert">{error}</p>}
          <label>Current password<PasswordInput name="current" autoComplete="current-password" required autoFocus /></label>
          <label>New password<PasswordInput name="next" autoComplete="new-password" required minLength={8} /></label>
          <label>Repeat new password<PasswordInput name="repeat" autoComplete="new-password" required minLength={8} /></label>
          <p style={{ fontSize: 13, color: "var(--muted, #6b7280)" }}>At least 8 characters. You&apos;ll be signed out on your other devices.</p>
          <div className="modal-actions">
            <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
            <button type="submit" className="primary" disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
