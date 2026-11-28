"use client";
import { useEffect, useRef } from "react";

/** Cloudflare Turnstile, the "are you a person" check. The token it gives is checked again by the server. */
type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: TurnstileApi } }

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<void> | null = null;
let lastWidget: string | undefined;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const script = Object.assign(document.createElement("script"), { src: SCRIPT, async: true, defer: true });
    script.onload = () => resolve();
    script.onerror = () => { loading = null; reject(new Error("The security check could not load.")); };
    document.head.appendChild(script);
  });
  return loading;
}

/** Asks Turnstile for a new token, e.g. after a failed send (each token works once). */
export function resetTurnstile() {
  if (window.turnstile && lastWidget) window.turnstile.reset(lastWidget);
}

export function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const report = useRef(onToken);
  report.current = onToken;

  useEffect(() => {
    let id: string | undefined, gone = false;
    loadScript().then(() => {
      if (gone || !box.current || !window.turnstile) return;
      id = window.turnstile.render(box.current, {
        sitekey: siteKey, theme: "dark", action: "book-demo",
        callback: (token: string) => report.current(token),
        "expired-callback": () => report.current(""),
        "error-callback": () => report.current(""),
      });
      lastWidget = id;
    }).catch(() => report.current(""));
    return () => { gone = true; if (id && window.turnstile) window.turnstile.remove(id); };
  }, [siteKey]);

  return <div ref={box} className="turnstile" />;
}
