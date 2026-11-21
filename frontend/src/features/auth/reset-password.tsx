"use client";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";

/** Page opened from the reset email: choose a new password for the account. */
export function ResetPassword({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(token ? "" : "This reset link is incomplete. Please request a new one.");
  const [done, setDone] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? ""), confirm = String(data.get("confirm") ?? "");
    if (password.length < 8) { setError("Use at least 8 characters for your new password."); return; }
    if (password !== confirm) { setError("The two passwords don't match."); return; }
    setBusy(true);
    setError("");
    try {
      const result = await api<{ message: string }>("/api/auth/forgot-password/confirm", {
        method: "POST", body: JSON.stringify({ token, new_password: password }),
      });
      setDone(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The password could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <div className="login-backdrop-glow" aria-hidden="true" />
      <section className="login-card">
        <div className="login-header">
          <div className="login-brand" aria-label="SciProspect">
            <img src="/branding/sciprospect-a-icon.png" alt="" width="56" height="56" />
            <span>SciProspect</span>
          </div>
          <h1>Set a new password</h1>
          <p>Choose a password with at least 8 characters.</p>
        </div>
        {error && <div className="alert login-alert" role="alert" style={{ marginTop: "20px" }}><span>{error}</span></div>}
        {done ? (
          <>
            <div className="alert login-success" role="status" style={{ marginTop: "20px" }}><span>{done}</span></div>
            <a className="button primary login-submit" href="/login" style={{ marginTop: "1rem", display: "block", textAlign: "center" }}>Go to sign in</a>
          </>
        ) : token && (
          <form onSubmit={submit} noValidate>
            <div className="form-group">
              <label htmlFor="new-password">New password</label>
              <div className="input-wrapper"><input id="new-password" name="password" type="password" autoComplete="new-password" required minLength={8} /></div>
            </div>
            <div className="form-group">
              <label htmlFor="confirm-password">Repeat new password</label>
              <div className="input-wrapper"><input id="confirm-password" name="confirm" type="password" autoComplete="new-password" required minLength={8} /></div>
            </div>
            <button className="primary login-submit" type="submit" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
          </form>
        )}
        <footer className="login-footer"><p><a href="/login">← Back to sign in</a></p></footer>
      </section>
    </main>
  );
}
