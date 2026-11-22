"use client";
import { useEffect, useState, type FormEvent } from "react";
import { AuthBackdrop } from "@/features/marketing/auth-backdrop";
import { api } from "@/lib/api";
import type { Session } from "@/lib/contracts";

type Plan = { id: string; name: string; price_month: number };

/** Self sign-up: details → 6-digit email code → signed in → checkout (paid plans) or workspace. */
export function Signup({ initialPlan }: { initialPlan: string }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plan, setPlan] = useState(initialPlan || "free");
  const [kind, setKind] = useState<"single" | "org">("single");
  const [step, setStep] = useState<"details" | "code">("details");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    setBusy(true); setError("");
    try {
      const result = await api<{ signed_in?: boolean }>("/api/auth/signup/verify", { method: "POST", body: JSON.stringify({ email, code, password }) });
      if (result.signed_in === false) { window.location.assign("/login"); return; }
      if (chosen && chosen.price_month > 0) { window.location.assign(`/billing?plan=${encodeURIComponent(chosen.id)}`); return; }
      const me = await api<Session>("/api/auth/me");
      window.location.assign(`/${me.user.workspace_namespace}/dashboard`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code didn't work.");
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <AuthBackdrop />
      <section className="login-card">
        <div className="login-header">
          <a className="login-brand" aria-label="SciProspect home" href="/">
            <img src="/branding/sciprospect-a-icon.png" alt="" width="56" height="56" />
            <span>SciProspect</span>
          </a>
          <h1>{step === "details" ? "Create your account" : "Check your email"}</h1>
          <p>{step === "details" ? "Start free. You can change your plan at any time." : `Enter the 6-digit code we sent to ${email}.`}</p>
        </div>
        {error && <div className="alert login-alert" role="alert" style={{ marginTop: 20 }}><span>{error}</span></div>}
        {info && step === "code" && <div className="alert login-success" role="status" style={{ marginTop: 20 }}><span>{info}</span></div>}

        {step === "details" ? (
          <form onSubmit={start} noValidate>
            <div className="form-group">
              <label htmlFor="su-plan">Plan</label>
              <div className="input-wrapper">
                <select id="su-plan" value={plan} onChange={e => setPlan(e.target.value)}>
                  {(plans.length ? plans : [{ id: plan, name: plan, price_month: 0 }]).map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.price_month > 0 ? ` · $${p.price_month}/month` : " · Free"}</option>
                  ))}
                </select>
              </div>
            </div>
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
              <div className="input-wrapper"><input id="su-password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" /></div>
            </div>
            <label style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, fontSize: 13, fontWeight: 400 }}>
              <input type="checkbox" name="terms" style={{ marginTop: 3 }} />I agree to the terms of service and privacy policy.
            </label>
            <button className="primary login-submit" type="submit" disabled={busy}>{busy ? "Sending code…" : "Create account"}</button>
            <p style={{ textAlign: "center", marginTop: 16, fontSize: 14 }}>Already have an account? <a href="/login">Log in</a></p>
          </form>
        ) : (
          <form onSubmit={verify} noValidate>
            <div className="form-group">
              <label htmlFor="su-code">6-digit code</label>
              <div className="input-wrapper"><input id="su-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus placeholder="123456" /></div>
            </div>
            <button className="primary login-submit" type="submit" disabled={busy}>{busy ? "Checking…" : "Verify and continue"}</button>
            <button type="button" className="link-button" style={{ marginTop: "1rem", width: "100%" }} onClick={() => { setStep("details"); setError(""); }}>
              ← Change details or send a new code
            </button>
          </form>
        )}
        <footer className="login-footer"><p><a href="/">← Back to home</a></p></footer>
      </section>
    </main>
  );
}
