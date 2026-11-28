import type { Metadata } from "next";
import { session } from "@/lib/session";
import { BookDemo } from "@/features/marketing/book-demo";

export const metadata: Metadata = {
  title: "Book a demo · SciProspect",
  description: "See SciProspect with your own research topic and event in a 30-minute call with our team.",
  alternates: { canonical: "/demo" },
};

/** The Cloudflare Turnstile site key, or "" when the check is off (local development). */
async function captchaKey(): Promise<string> {
  try {
    const origin = process.env.FASTAPI_ORIGIN || "http://127.0.0.1:8000";
    const response = await fetch(origin + "/api/public/captcha", { cache: "no-store" });
    return response.ok ? String((await response.json()).site_key || "") : "";
  } catch {
    return "";  // the server will still ask for the check if it is on; the form then explains
  }
}

export default async function Page() {
  const [key, current] = await Promise.all([captchaKey(), session()]);
  return <BookDemo captchaSiteKey={key} signedInHref={current ? "/dashboard" : null} />;
}
