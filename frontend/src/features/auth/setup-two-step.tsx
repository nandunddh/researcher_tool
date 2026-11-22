"use client";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { AuthBackdrop } from "@/features/marketing/auth-backdrop";

/** Where to go after setup (e.g. checkout chosen at sign-up). Stored for this tab only, so URLs stay clean. */
export const AFTER_SETUP_KEY = "sciprospect:after-setup";

/** Required for every account: set up an authenticator app before using the workspace. */
export function SetupTwoStep({ workspace, email }: { workspace: string; email: string }) {
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function start() {
    setBusy(true); setError("");
    try { setSetup(await api<{ secret: string; qr: string }>("/api/auth/mfa/setup", { method: "POST" })); }
    catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(false); }
  }
  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    setBusy(true); setError("");
    try {
      const result = await api<{ backup_codes: string[] }>("/api/auth/mfa/enable", { method: "POST", body: JSON.stringify({ code }) });
      setCodes(result.backup_codes);
    } catch (e) { setError(e instanceof Error ? e.message : "That code didn't work."); }
    finally { setBusy(false); }
  }
  function download() {
    const text = ["SciProspect backup codes", email, "", ...codes, "", "Each code works once. Keep them somewhere safe."].join("\r\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    Object.assign(document.createElement("a"), { href: url, download: "sciprospect-backup-codes.txt" }).click();
    URL.revokeObjectURL(url);
    setSaved(true);
  }
  function finish() {
    let next = workspace;
    try { next = sessionStorage.getItem(AFTER_SETUP_KEY) || workspace; sessionStorage.removeItem(AFTER_SETUP_KEY); } catch { /* private mode */ }
    window.location.assign(next.startsWith("/") ? next : workspace);
  }

  const step = codes.length ? 3 : setup ? 2 : 1;
  return (
    <main className="login-screen">
      <AuthBackdrop />
      <section className="login-card" style={{ maxWidth: 480 }}>
        <div className="login-header">
          <div className="login-brand"><img src="/branding/sciprospect-a-icon.png" alt="" width="56" height="56" /><span>SciProspect</span></div>
          <p style={{ margin: "0 0 6px", fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", color: "#c8ff4d", fontWeight: 700 }}>Step {step} of 3</p>
          <h1>{step === 3 ? "Save your backup codes" : "Protect your account"}</h1>
          <p>{step === 1 && "Two-step sign-in is required for every SciProspect account. After your password, you'll enter a 6-digit code from an app on your phone."}
            {step === 2 && "Open Google Authenticator (or any authenticator app), tap +, and scan this code."}
            {step === 3 && "If you lose your phone, each of these codes lets you sign in once. They won't be shown again."}</p>
        </div>
        {error && <div className="alert login-alert" role="alert" style={{ marginTop: 18 }}><span>{error}</span></div>}

        {step === 1 && (
          <>
            <ol style={{ margin: "22px 0 0", paddingLeft: 20, color: "#a1a1aa", fontSize: 14, lineHeight: 1.8 }}>
              <li>Install <strong style={{ color: "#f4f4f5" }}>Google Authenticator</strong> or Microsoft Authenticator on your phone.</li>
              <li>Scan the QR code we show you.</li>
              <li>Enter the 6-digit code from the app.</li>
            </ol>
            <button type="button" className="primary login-submit" style={{ marginTop: 22, width: "100%" }} disabled={busy} onClick={() => void start()}>{busy ? "Preparing…" : "Set up now"}</button>
          </>
        )}

        {step === 2 && setup && (
          <form onSubmit={confirm} noValidate>
            <img src={setup.qr} alt="QR code for your authenticator app" width={196} height={196} style={{ display: "block", margin: "22px auto 10px", background: "#fff", borderRadius: 12, padding: 6 }} />
            <p style={{ fontSize: 12.5, color: "#a1a1aa", textAlign: "center", margin: "0 0 18px" }}>Can&apos;t scan? Choose “Enter a setup key” and type:<br /><code style={{ color: "#f4f4f5", wordBreak: "break-all" }}>{setup.secret}</code></p>
            <div className="form-group">
              <label htmlFor="mfa-setup-code">6-digit code from the app</label>
              <div className="input-wrapper"><input id="mfa-setup-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required autoFocus placeholder="123456" /></div>
            </div>
            <button className="primary login-submit" type="submit" style={{ width: "100%" }} disabled={busy}>{busy ? "Checking…" : "Turn on two-step sign-in"}</button>
          </form>
        )}

        {step === 3 && (
          <>
            <ul style={{ listStyle: "none", padding: 16, margin: "20px 0 14px", columns: 2, fontFamily: "ui-monospace, Consolas, monospace", fontSize: 15, lineHeight: 2, background: "#0c0c0e", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, color: "#f4f4f5", textAlign: "center" }}>
              {codes.map(c => <li key={c}>{c}</li>)}
            </ul>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="link-button" style={{ flex: 1 }} onClick={download}>Download codes</button>
              <button type="button" className="link-button" style={{ flex: 1 }} onClick={() => { void navigator.clipboard?.writeText(codes.join("\n")); setSaved(true); }}>Copy codes</button>
            </div>
            <label style={{ flexDirection: "row", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 400, margin: "16px 0 0" }}>
              <input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} />I&apos;ve saved my backup codes somewhere safe.
            </label>
            <button type="button" className="primary login-submit" style={{ marginTop: 16, width: "100%" }} disabled={!saved} onClick={finish}>Continue</button>
          </>
        )}
        <footer className="login-footer"><p>Signed in as {email}. <a href="/login" onClick={async e => { e.preventDefault(); await api("/api/auth/logout", { method: "POST" }).catch(() => undefined); window.location.assign("/login"); }}>Sign out</a></p></footer>
      </section>
    </main>
  );
}
