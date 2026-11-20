"use client";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import type { Session } from "@/lib/contracts";
import { Icon } from "@/components/icon";

type AuthMode = "login" | "forgot";

export function Login({ returnPath }: { returnPath: string | null }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Form input states
  const [email, setEmail] = useState("");

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

  return (
    <main className="login-screen">
      <div className="login-backdrop-glow" aria-hidden="true" />
      <section className="login-card">
        <div className="login-header">
          <div className="login-brand" aria-label="SciProspect">
            <img src="/branding/sciprospect-a-icon.png" alt="" width="56" height="56" />
            <span>SciProspect</span>
          </div>
          <h1>{mode === "login" ? "Welcome back" : "Reset Password"}</h1>
          <p>
            {mode === "login"
              ? "Please enter your email and password."
              : "Self-service password resets are disabled for account security."}
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
          </form>
        )}

        {mode === "forgot" && (
          <div className="forgot-notice" style={{ marginTop: "1rem" }}>
            <p style={{ color: "var(--text-secondary, #64748b)", fontSize: "0.92rem", lineHeight: 1.5, marginBottom: "1.5rem" }}>
              To protect your account security, password resets are handled directly by your organization or system administrator. Please reach out to your administrator to receive new credentials.
            </p>
            <button
              type="button"
              className="primary login-submit"
              onClick={() => {
                setError("");
                setSuccess("");
                setMode("login");
              }}
            >
              ← Back to Sign in
            </button>
          </div>
        )}

        <footer className="login-footer">
          <p>&copy; {new Date().getFullYear()} SciProspect. All rights reserved.</p>
        </footer>
      </section>
    </main>
  );
}
