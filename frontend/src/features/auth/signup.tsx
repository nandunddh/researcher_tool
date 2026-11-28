"use client";
import { useEffect, useState, type FormEvent } from "react";
import { BrandText } from "@/components/brand-text";
import { AuthBackdrop } from "@/features/marketing/auth-backdrop";
import { api } from "@/lib/api";
import { CodeInput } from "@/components/code-input";
import { PasswordInput } from "@/components/password-input";
import { AFTER_SETUP_KEY } from "./setup-two-step";

type Plan = { id: string; name: string; price_month: number };

/** Self sign-up: details → 6-digit email code → signed in → checkout (paid plans) or workspace. */
export function Signup({ initialPlan }: { initialPlan: string }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const plan = initialPlan || "trial"; // everyone starts the trial; a plan chosen on the pricing page is paid for after sign-up
  const [kind, setKind] = useState<"single" | "org">("single");
  const [step, setStep] = useState<"details" | "code">("details");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    api<{ plans: Plan[] }>("/api/public/plans").then(r => setPlans(r.plans)).catch(() => undefined);
  }, []);
  const chosen = plans.find(p => p.id === plan);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError(""); setInfo("");
    try {
      const result = await api<{ message: string }>("/api/auth/signup/start", {
        method: "POST", body: JSON.stringify({
          name: data.get("name"), email, password, account_type: kind, org_name: data.get("org_name") ?? "",
          plan_id: plan, accept_terms: data.get("terms") === "on",
        }),
      });
      setInfo(result.message);
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  }

  /** Runs by itself when the last digit is entered. */
  async function verify(code: string) {
    setBusy(true); setError("");
    try {
      const result = await api<{ signed_in?: boolean }>("/api/auth/signup/verify", { method: "POST", body: JSON.stringify({ email, code, password }) });
      if (result.signed_in === false) { window.location.assign("/login"); return; }
      // Two-step sign-in comes first; then checkout for a paid plan, else the workspace.
      if (chosen && chosen.price_month > 0) { try { sessionStorage.setItem(AFTER_SETUP_KEY, `/billing/upgrade/${encodeURIComponent(chosen.id)}`); } catch { /* private mode */ } }
      window.location.assign("/setup-2fa");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code didn't work.");
      setCode("");
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <AuthBackdrop />
      <section className="login-card">
        <div className="login-header">
          <a className="login-brand" aria-label="SciProspect home" href="/">
            <img src="/branding/sciprospect-a-icon-lime.png" alt="" width="56" height="56" />
            <BrandText />
          </a>
          <h1>{step === "details" ? "Start your 7-day free trial" : "Check your email"}</h1>
          <p>{step === "details" ? "No card needed. Choose a plan any time during or after your trial." : `Enter the 6-digit code we sent to ${email}.`}</p>
        </div>
        {error && <div className="alert login-alert" role="alert" style={{ marginTop: 20 }}><span>{error}</span></div>}
        {info && step === "code" && <div className="alert login-success" role="status" style={{ marginTop: 20 }}><span>{info}</span></div>}

        {step === "details" ? (
          <form onSubmit={start} noValidate>
            {chosen && chosen.price_month > 0 && (
              <p className="login-success alert" role="note" style={{ marginBottom: 16 }}>
                You chose the <strong>{chosen.name}</strong> plan. After you verify your email and secure your account, you&apos;ll go to checkout. Prefer to try first? <a href="/signup">Start the free trial</a> instead.
              </p>
            )}
            <div className="form-group">
              <label htmlFor="su-name">Your name</label>
              <div className="input-wrapper"><input id="su-name" name="name" autoComplete="name" required /></div>
            </div>
            <div className="form-group">
              <span style={{ fontSize: 13, fontWeight: 600 }}>Account for</span>
              <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
                <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><input type="radio" checked={kind === "single"} onChange={() => setKind("single")} />Just me</label>
                <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><input type="radio" checked={kind === "org"} onChange={() => setKind("org")} />An organization / team</label>
              </div>
            </div>
            {kind === "org" && (
              <div className="form-group">
                <label htmlFor="su-org">Organization name</label>
                <div className="input-wrapper"><input id="su-org" name="org_name" autoComplete="organization" required /></div>
              </div>
            )}
            <div className="form-group">
              <label htmlFor="su-email">Work email</label>
              <div className="input-wrapper"><input id="su-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@organization.org" /></div>
            </div>
            <div className="form-group">
              <label htmlFor="su-password">Password</label>
              <PasswordInput variant="auth" id="su-password" autoComplete="new-password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" />
            </div>
            <label style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, fontSize: 13, fontWeight: 400 }}>
              <input type="checkbox" name="terms" style={{ marginTop: 3 }} /><span>I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer">terms of service</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer">privacy policy</a>.</span>
            </label>
            <button className="primary login-submit" type="submit" disabled={busy}>{busy ? "Sending code…" : "Create account"}</button>
            <p style={{ textAlign: "center", marginTop: 16, fontSize: 14 }}>Already have an account? <a href="/login">Log in</a></p>
            <p style={{ textAlign: "center", marginTop: 6, fontSize: 14 }}>Prefer a guided tour? <a href="/demo">Book a demo</a></p>
          </form>
        ) : (
          <form onSubmit={e => e.preventDefault()} noValidate>
            <div className="form-group">
              <span className="code-label">6-digit code</span>
              <CodeInput value={code} onChange={setCode} onComplete={verify} autoFocus disabled={busy} invalid={!!error} />
            </div>
            <p className="code-status" role="status" aria-live="polite">{busy ? "Checking your code…" : "We check it as soon as you enter the last digit."}</p>
            <button type="button" className="link-button" style={{ marginTop: "1rem", width: "100%" }} onClick={() => { setStep("details"); setError(""); setCode(""); }}>
              ← Change details or send a new code
            </button>
          </form>
        )}
        <footer className="login-footer"><p><a href="/">← Back to home</a></p></footer>
      </section>
    </main>
  );
}
