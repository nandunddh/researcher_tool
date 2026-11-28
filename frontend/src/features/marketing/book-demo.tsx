"use client";
import { useState, type FormEvent } from "react";
import { AuthBackdrop } from "@/features/marketing/auth-backdrop";
import { BrandText } from "@/components/brand-text";

const INTERESTS: [string, string][] = [["both", "Both"], ["collect", "Collecting researcher contacts"], ["studio", "Event websites (SciStudio)"], ["custom", "A custom plan"]];

/** Public "Book a demo" form. The team gets an email and sees the request in Root; the visitor gets a confirmation. */
export function BookDemo() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "");
    if (!value("name").trim()) { setError("Please enter your name."); return; }
    if (!/^\S+@\S+\.\S{2,}$/.test(value("email").trim())) { setError("Please enter a valid email address."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/public/demo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value("name"), email: value("email"), organization: value("organization"), interest: value("interest"),
          message: value("message"), times: [value("time1"), value("time2")], _hp: value("_hp") }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof body?.detail === "string" ? body.detail : "Your request could not be sent. Please try again.");
      setDone(body?.message ?? "Thank you! We will be in touch soon.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your request could not be sent. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <AuthBackdrop />
      <section className="login-card" style={{ maxWidth: 520 }}>
        <div className="login-header">
          <a className="login-brand" aria-label="SciProspect home" href="/">
            <img src="/branding/sciprospect-a-icon-lime.png" alt="" width="56" height="56" />
            <BrandText />
          </a>
          <h1>{done ? "Request received" : "Book a demo"}</h1>
          <p>{done || "See SciProspect with your own topic and event. A 30-minute call with our team, at a time that suits you."}</p>
        </div>
        {error && <div className="alert login-alert" role="alert" style={{ marginTop: 20 }}><span>{error}</span></div>}
        {done ? (
          <p style={{ textAlign: "center", marginTop: 24 }}><a href="/">Back to the home page</a> · <a href="/signup">Start the free trial meanwhile</a></p>
        ) : (
          <form onSubmit={send} noValidate>
            <div className="form-group">
              <label htmlFor="demo-name">Your name</label>
              <div className="input-wrapper"><input id="demo-name" name="name" autoComplete="name" required maxLength={120} /></div>
            </div>
            <div className="form-group">
              <label htmlFor="demo-email">Work email</label>
              <div className="input-wrapper"><input id="demo-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@organization.org" /></div>
            </div>
            <div className="form-group">
              <label htmlFor="demo-org">Organization</label>
              <div className="input-wrapper"><input id="demo-org" name="organization" autoComplete="organization" maxLength={160} /></div>
            </div>
            <div className="form-group">
              <label htmlFor="demo-interest">Most interested in</label>
              <div className="input-wrapper"><select id="demo-interest" name="interest" defaultValue="both">{INTERESTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
            </div>
            <div className="form-group">
              <span style={{ fontSize: 13, fontWeight: 600 }}>Two times that suit you (optional)</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 6 }}>
                <div className="input-wrapper"><input name="time1" aria-label="First preferred time" maxLength={80} placeholder="e.g. Tue 10:00 CET" /></div>
                <div className="input-wrapper"><input name="time2" aria-label="Second preferred time" maxLength={80} placeholder="e.g. Thu 15:00 CET" /></div>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="demo-message">What would you like to see?</label>
              <div className="input-wrapper"><textarea id="demo-message" name="message" rows={4} maxLength={2000} placeholder="Your research area, event size, or questions" /></div>
            </div>
            {/* spam trap: hidden from people, bots fill it */}
            <input name="_hp" tabIndex={-1} autoComplete="off" readOnly aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
            <button className="primary login-submit" type="submit" disabled={busy}>{busy ? "Sending…" : "Request a demo"}</button>
            <p style={{ textAlign: "center", marginTop: 16, fontSize: 14 }}>Prefer to explore first? <a href="/signup">Start the 7-day free trial</a></p>
          </form>
        )}
      </section>
    </main>
  );
}
