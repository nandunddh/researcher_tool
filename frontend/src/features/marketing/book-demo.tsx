"use client";
import { useState, type FormEvent } from "react";
import { Turnstile, resetTurnstile } from "@/components/turnstile";
import { AuthBackdrop } from "@/features/marketing/auth-backdrop";
import { MarketingFooter, MarketingHeader } from "./site-chrome";
import { MotionEffects } from "./motion";
import s from "./landing.module.css";

const INTERESTS: [string, string][] = [["both", "Both"], ["collect", "Collecting researcher contacts"], ["studio", "Event websites (SciStudio)"], ["custom", "A custom plan"]];

type Note = { kind: "ok" | "error"; text: string } | null;

/** Help text under a field; the input points to it with aria-describedby. */
function Help({ id, text }: { id: string; text?: string }) {
  return text ? <p id={id} className="field-help" role="alert">{text}</p> : null;
}

/** Public "Book a demo" form. The team gets an email and sees the request in Root; the visitor gets a confirmation. */
export function BookDemo({ captchaSiteKey, signedInHref }: { captchaSiteKey: string; signedInHref: string | null }) {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Note>(null);
  const [captcha, setCaptcha] = useState("");

  function fresh() {
    // A Turnstile token works once; get a new one for the next send.
    if (captchaSiteKey) { setCaptcha(""); resetTurnstile(); }
  }

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const value = (key: string) => String(form.get(key) ?? "");
    const found: Record<string, string> = {};
    if (!value("name").trim()) found.name = "Please enter your name.";
    if (!/^\S+@\S+\.\S{2,}$/.test(value("email").trim())) found.email = "Please enter a valid email address.";
    if (captchaSiteKey && !captcha) found.captcha = "Please complete the check that you are a person.";
    setErrors(found);
    setNote(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const response = await fetch("/api/public/demo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value("name"), email: value("email"), organization: value("organization"), interest: value("interest"),
          message: value("message"), times: [value("time1"), value("time2")], _hp: value("_hp"), captcha }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof body?.detail === "string" ? body.detail : "Your request could not be sent. Please try again.");
      setNote({ kind: "ok", text: body?.message ?? "Thank you! We will be in touch soon." });
      formEl.reset();
      fresh();
    } catch (err) {
      setNote({ kind: "error", text: err instanceof Error ? err.message : "Your request could not be sent. Please try again." });
      fresh();
    } finally {
      setBusy(false);
    }
  }

  /** Clears a field's help text as soon as the visitor edits that field. */
  function edited(e: FormEvent<HTMLFormElement>) {
    const name = (e.target as HTMLInputElement).name;
    if (errors[name]) setErrors(({ [name]: _, ...rest }) => rest);
  }

  const invalid = (key: string) => (errors[key] ? { "aria-invalid": true, "aria-describedby": `demo-${key}-help` } : {});

  return (
    <div className={s.page}>
      <MotionEffects />{/* gives the sticky header its solid background once the page scrolls */}
      <MarketingHeader label="Main" signedInHref={signedInHref} showDemo={false}
        links={[["/#story", "Product"], ["/#features", "Features"], ["/pricing", "Pricing"], ["/#faq", "FAQ"]]} />
      {/* The sign-in style card, sized to its content between the site header and footer. */}
      <main className="login-screen" style={{ minHeight: "auto", padding: "40px 24px 72px" }}>
        <AuthBackdrop />
        <section className="login-card" style={{ maxWidth: 780, width: "100%" }}>
          <div className="login-header">
            <h1>Book a demo</h1>
            <p>See SciProspect with your own topic and event. A 30-minute call with our team, at a time that suits you.</p>
          </div>
          <form onSubmit={send} onInput={edited} noValidate>
            {/* Two fields per row on wide screens, one per row on phones (.form-row in globals.css). */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="demo-name">Your name</label>
                <div className="input-wrapper"><input id="demo-name" name="name" autoComplete="name" required maxLength={120} {...invalid("name")} /></div>
                <Help id="demo-name-help" text={errors.name} />
              </div>
              <div className="form-group">
                <label htmlFor="demo-email">Work email</label>
                <div className="input-wrapper"><input id="demo-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@organization.org" {...invalid("email")} /></div>
                <Help id="demo-email-help" text={errors.email} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="demo-org">Organization</label>
                <div className="input-wrapper"><input id="demo-org" name="organization" autoComplete="organization" maxLength={160} /></div>
              </div>
              <div className="form-group">
                <label htmlFor="demo-interest">Most interested in</label>
                <div className="input-wrapper"><select id="demo-interest" name="interest" defaultValue="both">{INTERESTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="demo-time1">Preferred time (optional)</label>
                <div className="input-wrapper"><input id="demo-time1" name="time1" maxLength={80} placeholder="e.g. Tue 10:00 CET" /></div>
              </div>
              <div className="form-group">
                <label htmlFor="demo-time2">Another time (optional)</label>
                <div className="input-wrapper"><input id="demo-time2" name="time2" maxLength={80} placeholder="e.g. Thu 15:00 CET" /></div>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="demo-message">What would you like to see?</label>
              <div className="input-wrapper"><textarea id="demo-message" name="message" rows={4} maxLength={2000} placeholder="Your research area, event size, or questions" /></div>
            </div>
            {/* spam trap: hidden from people, bots fill it */}
            <input name="_hp" tabIndex={-1} autoComplete="off" readOnly aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
            {/* The check and the button share one row (stacked on phones, .submit-row in globals.css). */}
            <div className="submit-row">
              {captchaSiteKey && (
                <div>
                  <Turnstile siteKey={captchaSiteKey} onToken={(token) => { setCaptcha(token); if (token) setErrors(({ captcha: _, ...rest }) => rest); }} />
                  <Help id="demo-captcha-help" text={errors.captcha} />
                </div>
              )}
              <button className="primary login-submit" type="submit" disabled={busy}>{busy ? "Sending…" : "Request a demo"}</button>
            </div>
            {note && <p className={`form-note ${note.kind}`} role={note.kind === "ok" ? "status" : "alert"}>{note.text}</p>}
            <p style={{ textAlign: "center", marginTop: 16, fontSize: 14 }}>Prefer to explore first? <a href="/signup">Start the 7-day free trial</a></p>
          </form>
        </section>
      </main>
      <MarketingFooter links={[["/", "Home"], ["/pricing", "Pricing"], ["/terms", "Terms"], ["/privacy", "Privacy"], ["/login", "Log in"]]} />
    </div>
  );
}
