"use client";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { Session } from "@/lib/contracts";
import { Icon } from "@/components/icon";

type AuthMode = "login" | "forgot-email" | "forgot-password";

export function Login({ returnPath }: { returnPath: string | null }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Form input states
  const [email, setEmail] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const data = new FormData(event.currentTarget);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          identifier: data.get("email"),
          password: data.get("password"),
        }),
      });
      const current = await api<Session>("/api/auth/me");
      window.location.assign(returnPath || `/${current.user.workspace_namespace}/dashboard`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed. Please verify your credentials.");
      setBusy(false);
    }
  }

  async function handleForgotCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError("Please enter your registered email address.");
      setBusy(false);
      return;
    }
    try {
      await api<{ status: string; exists: boolean; message?: string }>("/api/auth/forgot-password/check", {
        method: "POST",
        body: JSON.stringify({ email: cleanEmail }),
      });
      setVerifiedEmail(cleanEmail);
      setMode("forgot-password");
      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No account found matching this email.");
      setBusy(false);
    }
  }

  async function handleForgotReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match. Please re-enter them.");
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ status: string; message?: string }>("/api/auth/forgot-password/reset", {
        method: "POST",
        body: JSON.stringify({ email: verifiedEmail, new_password: newPassword }),
      });
      setSuccess(res.message || "Password updated successfully. You can now sign in.");
      setEmail(verifiedEmail);
      setNewPassword("");
      setConfirmPassword("");
      setMode("login");
      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <div className="login-backdrop-glow" aria-hidden="true" />
      <section className="login-card">
        <div className="login-header">
          <div className="login-mark">
            <img src="/sciprospect_icon.svg" alt="SciProspect" width="42" height="42" />
          </div>
          <span className="login-badge">SciProspect Portal</span>
          <h1>{mode === "login" ? "Welcome back" : "Reset Password"}</h1>
          <p>
            {mode === "login"
              ? "Please enter your email and password."
              : mode === "forgot-email"
              ? "Enter your registered email to reset your account password."
              : `Create a new password for ${verifiedEmail}`}
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
                    setMode("forgot-email");
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
          </form>
        )}

        {mode === "forgot-email" && (
          <form onSubmit={handleForgotCheck} noValidate>
            <div className="form-group">
              <label htmlFor="forgot-email">Registered Email</label>
              <div className="input-wrapper">
                <input
                  id="forgot-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="e.g. user@institution.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                  autoFocus
                />
              </div>
            </div>

            <button className="primary login-submit" type="submit" disabled={busy}>
              {busy ? "Checking…" : "Continue"}
            </button>

            <button
              type="button"
              className="auth-back-btn"
              onClick={() => {
                setError("");
                setSuccess("");
                setMode("login");
              }}
              disabled={busy}
            >
              ← Back to Sign in
            </button>
          </form>
        )}

        {mode === "forgot-password" && (
          <form onSubmit={handleForgotReset} noValidate>
            <div className="account-banner">
              <span>Account: <strong>{verifiedEmail}</strong></span>
            </div>

            <div className="form-group">
              <label htmlFor="forgot-new-password">New Password</label>
              <div className="input-wrapper password-wrapper">
                <input
                  id="forgot-new-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={busy}
                  autoFocus
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

            <div className="form-group">
              <label htmlFor="forgot-confirm-password">Confirm New Password</label>
              <div className="input-wrapper password-wrapper">
                <input
                  id="forgot-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={busy}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                  title={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                >
                  <Icon name={showConfirmPassword ? "eye-off" : "eye"} size={18} />
                </button>
              </div>
            </div>

            <button className="primary login-submit" type="submit" disabled={busy}>
              {busy ? "Updating…" : "Reset Password"}
            </button>

            <button
              type="button"
              className="auth-back-btn"
              onClick={() => {
                setError("");
                setSuccess("");
                setMode("login");
              }}
              disabled={busy}
            >
              ← Back to Sign in
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
