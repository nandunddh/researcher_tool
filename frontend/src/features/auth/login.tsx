"use client";
import { useState, type FormEvent } from "react";
import { AuthBackdrop } from "@/features/marketing/auth-backdrop";
import { api } from "@/lib/api";
import { CodeInput } from "@/components/code-input";
import { PasswordInput } from "@/components/password-input";
import type { Session } from "@/lib/contracts";
import { Icon } from "@/components/icon";

type AuthMode = "login" | "forgot" | "mfa";

export function Login({ returnPath }: { returnPath: string | null }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Form input states
  const [email, setEmail] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [mfaToken, setMfaToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);

  async function finishSignIn() {
    const current = await api<Session>("/api/auth/me");
    if (current.user.mfa_setup_required) { window.location.assign("/setup-2fa"); return; }
    window.location.assign(returnPath || `/${current.user.workspace_namespace}/dashboard`);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ status: string; mfa_token?: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          identifier: data.get("email"),
          password: data.get("password"),
        }),
      });
      if (result.status === "mfa_required" && result.mfa_token) {
        setMfaToken(result.mfa_token);
        setMode("mfa");
        setBusy(false);
        return;
      }
      await finishSignIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed. Please verify your credentials.");
      setBusy(false);
    }
  }

  async function handleForgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await api<{ message: string }>("/api/auth/forgot-password/request", {
        method: "POST", body: JSON.stringify({ email: email.trim() }),
      });
      setSuccess(result.message);
      setCodeSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Runs by itself when the 6th digit is entered (authenticator code), or on submit for a backup code. */
  async function submitMfa(code: string) {
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/login/mfa", { method: "POST", body: JSON.stringify({ mfa_token: mfaToken, code }) });
      await finishSignIn();
    } catch (err) {
      const message = err instanceof Error ? err.message : "That code didn't work.";
      setError(message);
      setMfaCode("");
      if (/expired|again/i.test(message) && !/try again/i.test(message)) { setMode("login"); setMfaToken(""); }
      setBusy(false);
    }
  }

  async function handleNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const code = String(data.get("code") ?? "").trim(), password = String(data.get("password") ?? ""), repeat = String(data.get("repeat") ?? "");
    setError("");
    if (!/^\d{6}$/.test(code)) { setError("Enter the 6-digit code from the email."); return; }
    if (password.length < 8) { setError("Use at least 8 characters for your new password."); return; }
    if (password !== repeat) { setError("The two passwords don't match."); return; }
    setBusy(true);
    try {
      const result = await api<{ message: string }>("/api/auth/forgot-password/confirm", {
        method: "POST", body: JSON.stringify({ email: email.trim(), code, new_password: password }),
      });
      setCodeSent(false);
      setMode("login");
      setSuccess(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The password could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <AuthBackdrop />
      <section className="login-card">
        <div className="login-header">
          <div className="login-brand" aria-label="SciProspect">
            <img src="/branding/sciprospect-a-icon.png" alt="" width="56" height="56" />
            <span>SciProspect</span>
          </div>
          {/* One title per step: sign in, two-step code, password reset. */}
          <h1>{mode === "login" ? "Welcome back" : mode === "mfa" ? "Two-step sign-in" : "Reset password"}</h1>
          <p>
            {mode === "login"
              ? "Please enter your email and password."
              : mode === "mfa"
                ? "Your password is correct. Now enter the 6-digit code from your authenticator app."
                : "Enter your account email and we'll email you a 6-digit code to set a new password."}
          </p>
        </div>

        {error && (
          <div className="alert login-alert" role="alert" style={{ marginTop: "20px" }}>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="alert login-success" role="status" style={{ marginTop: "20px" }}>
            <span>{success}</span>
          </div>
        )}

        {mode === "login" && (
          <form onSubmit={handleLogin} noValidate>
            <div className="form-group">
              <label htmlFor="login-email">Email</label>
              <div className="input-wrapper">
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@organization.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                />
              </div>
            </div>

            <div className="form-group">
              <div className="label-row">
                <label htmlFor="login-password">Password</label>
                <button
                  type="button"
                  className="auth-text-link"
                  onClick={() => {
                    setError("");
                    setSuccess("");
                    setMode("forgot");
                  }}
                >
                  Forgot password?
                </button>
              </div>
              <div className="input-wrapper password-wrapper">
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="Enter your password"
                  disabled={busy}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  <Icon name={showPassword ? "eye-off" : "eye"} size={18} />
                </button>
              </div>
            </div>

            <button className="primary login-submit" type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <p style={{ textAlign: "center", marginTop: 16, fontSize: 14 }}>Don&apos;t have an account? <a href="/signup">Create one</a></p>
          </form>
        )}

        {mode === "mfa" && (
          <form onSubmit={e => { e.preventDefault(); if (useBackup) void submitMfa(String(new FormData(e.currentTarget).get("code") ?? "").trim()); }} noValidate>
            {useBackup ? (
              <>
                <p style={{ marginTop: "1rem" }}>Enter one of your backup codes. Each code works once.</p>
                <div className="form-group">
                  <label htmlFor="mfa-code">Backup code</label>
                  <div className="input-wrapper">
                    <input id="mfa-code" name="code" autoComplete="off" required autoFocus placeholder="1a2b3-c4d5e" />
                  </div>
                </div>
                <button className="primary login-submit" type="submit" disabled={busy}>{busy ? "Checking…" : "Verify and sign in"}</button>
              </>
            ) : (
              <>
                <p style={{ marginTop: "1rem" }}>Open your authenticator app and enter the 6-digit code for SciProspect.</p>
                <div className="form-group">
                  <span className="code-label">6-digit code</span>
                  <CodeInput value={mfaCode} onChange={setMfaCode} onComplete={submitMfa} autoFocus disabled={busy} invalid={!!error} />
                </div>
                <p className="code-status" role="status" aria-live="polite">{busy ? "Checking your code…" : "We check it as soon as you enter the last digit."}</p>
              </>
            )}
            <button type="button" className="link-button" style={{ marginTop: "1rem", width: "100%" }}
              onClick={() => { setUseBackup(v => !v); setError(""); setMfaCode(""); }}>
              {useBackup ? "Use my authenticator app instead" : "Lost your phone? Use a backup code"}
            </button>
            <button type="button" className="link-button" style={{ marginTop: "1rem", width: "100%" }}
              onClick={() => { setError(""); setMfaToken(""); setMfaCode(""); setUseBackup(false); setMode("login"); }}>
              ← Back to sign in
            </button>
          </form>
        )}

        {mode === "forgot" && codeSent && (
          <form onSubmit={handleNewPassword} noValidate>
            <div className="form-group">
              <span className="code-label">6-digit code</span>
              <CodeInput value={resetCode} onChange={setResetCode} autoFocus />
            </div>
            <div className="form-group">
              <label htmlFor="new-password">New password</label>
              <PasswordInput variant="auth" id="new-password" name="password" autoComplete="new-password" required minLength={8} />
            </div>
            <div className="form-group">
              <label htmlFor="repeat-password">Repeat new password</label>
              <PasswordInput variant="auth" id="repeat-password" name="repeat" autoComplete="new-password" required minLength={8} />
            </div>
            <button className="primary login-submit" type="submit" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
            <button type="button" className="link-button" style={{ marginTop: "1rem", width: "100%" }}
              onClick={() => { setError(""); setSuccess(""); setCodeSent(false); setResetCode(""); }}>
              Didn't get it? Send a new code
            </button>
          </form>
        )}

        {mode === "forgot" && !codeSent && (
          <form onSubmit={handleForgot} noValidate>
            <div className="form-group">
              <label htmlFor="forgot-email">Email</label>
              <div className="input-wrapper">
                <input id="forgot-email" type="email" autoComplete="email" required value={email}
                  onChange={e => setEmail(e.target.value)} placeholder="you@organization.org" />
              </div>
            </div>
            <button className="primary login-submit" type="submit" disabled={busy || !email.trim()}>
              {busy ? "Sending…" : "Send code"}
            </button>
            <button type="button" className="link-button" style={{ marginTop: "1rem", width: "100%" }}
              onClick={() => { setError(""); setSuccess(""); setCodeSent(false); setMode("login"); }}>
              ← Back to sign in
            </button>
          </form>
        )}

        <footer className="login-footer">
          <p>&copy; {new Date().getFullYear()} SciProspect. All rights reserved.</p>
        </footer>
      </section>
    </main>
  );
}
