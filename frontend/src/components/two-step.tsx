"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { Modal } from "./modal";

type Setup = { secret: string; qr: string };

/** Turn two-step sign-in (authenticator app) on or off for the signed-in account. */
export function TwoStepDialog({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [backup, setBackup] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ enabled: boolean }>("/api/auth/mfa").then(r => setEnabled(r.enabled)).catch(() => setError("Could not load your security settings."));
  }, []);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await work(); } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong."); } finally { setBusy(false); }
  }

  const code = (event: FormEvent<HTMLFormElement>) => String(new FormData(event.currentTarget).get("code") ?? "").trim();

  const start = () => run(async () => setSetup(await api<Setup>("/api/auth/mfa/setup", { method: "POST" })));
  const confirm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = code(event);
    void run(async () => {
      const result = await api<{ backup_codes: string[] }>("/api/auth/mfa/enable", { method: "POST", body: JSON.stringify({ code: value }) });
      setBackup(result.backup_codes);
      setSetup(null);
      setEnabled(true);
    });
  };
  const turnOff = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = code(event);
    void run(async () => {
      await api("/api/auth/mfa/disable", { method: "POST", body: JSON.stringify({ code: value }) });
      setEnabled(false);
    });
  };

  const codeField = (label: string) => (
    <div className="form-group">
      <label htmlFor="two-step-code">{label}</label>
      <input id="two-step-code" name="code" inputMode="numeric" autoComplete="one-time-code" required autoFocus placeholder="123456" />
    </div>
  );

  return (
    <Modal title="Two-step sign-in" onClose={onClose}>
      {error && <div className="alert" role="alert"><span>{error}</span></div>}
      {enabled === null && !error && <p>Loading…</p>}

      {backup.length > 0 ? (
        <>
          <p><strong>Two-step sign-in is on.</strong> Save these backup codes somewhere safe. Each one works once if you lose your phone. They won&apos;t be shown again.</p>
          <ul style={{ columns: 2, fontFamily: "monospace", fontSize: "1.05rem", lineHeight: 1.8, paddingLeft: "1.2rem" }}>
            {backup.map(c => <li key={c}>{c}</li>)}
          </ul>
          <button type="button" className="primary" onClick={() => void navigator.clipboard?.writeText(backup.join("\n"))}>Copy codes</button>{" "}
          <button type="button" onClick={onClose}>Done</button>
        </>
      ) : setup ? (
        <form onSubmit={confirm}>
          <p>1. Open <strong>Google Authenticator</strong>, tap <strong>+</strong>, and scan this code.</p>
          <img src={setup.qr} alt="QR code for your authenticator app" width={200} height={200} style={{ display: "block", margin: "0 auto", background: "#fff", borderRadius: 8 }} />
          <p style={{ fontSize: ".85rem" }}>Can&apos;t scan? Choose “Enter a setup key” and type: <code style={{ wordBreak: "break-all" }}>{setup.secret}</code></p>
          <p>2. Enter the 6-digit code the app shows.</p>
          {codeField("Code from the app")}
          <button className="primary" type="submit" disabled={busy}>{busy ? "Checking…" : "Turn on"}</button>
        </form>
      ) : enabled ? (
        <form onSubmit={turnOff}>
          <p><strong>Two-step sign-in is on.</strong> After your password, we ask for a code from your authenticator app.</p>
          <p>To turn it off, enter a code from the app or one of your backup codes.</p>
          {codeField("Code")}
          <button className="danger" type="submit" disabled={busy}>{busy ? "Checking…" : "Turn off"}</button>
        </form>
      ) : enabled === false && (
        <>
          <p>Add a second step when you sign in: after your password, enter a 6-digit code from an authenticator app such as Google Authenticator. Even if someone learns your password, they can&apos;t get in without your phone.</p>
          <button type="button" className="primary" disabled={busy} onClick={() => void start()}>{busy ? "Preparing…" : "Set up"}</button>
        </>
      )}
    </Modal>
  );
}
