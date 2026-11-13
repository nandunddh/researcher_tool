"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "./icon";
export function SignOut() {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <div><button className="danger" disabled={busy} onClick={async () => { setBusy(true); try { await api("/api/auth/logout", { method: "POST" }); window.location.assign("/"); } catch { setError("Sign out failed. Try again."); setBusy(false); } }}><Icon name="power" />{busy ? "Signing out…" : "Sign out"}</button>{error && <small role="alert">{error}</small>}</div>;
}
