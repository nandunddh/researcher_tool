import type { Metadata } from "next";
import { MarketingFooter, MarketingHeader } from "@/features/marketing/site-chrome";
import land from "@/features/marketing/landing.module.css";
import s from "./not-found.module.css";

export const metadata: Metadata = { title: "Page not found · SciProspect", robots: { index: false } };

/** Shown for any address that does not exist (instead of a raw server error). */
export default function NotFound() {
  return (
    <div className={land.page}>
      <MarketingHeader label="Main" signedInHref={null} links={[["/#features", "Features"], ["/pricing", "Pricing"], ["/demo", "Book a demo"]]} showDemo={false} />
      <main className={s.wrap}>
        <span className={s.code} aria-hidden="true">404</span>
        <h1>Page not found</h1>
        <p>The page you are looking for does not exist or has moved. Check the address, or head somewhere useful below.</p>
        <div className={s.actions}>
          <a className={land.btn} href="/dashboard">Go to your dashboard <span className={land.arrow}>→</span></a>
          <a className={land.btnGhost} href="/">Home page</a>
        </div>
      </main>
      <MarketingFooter links={[["/", "Home"], ["/pricing", "Pricing"], ["/terms", "Terms"], ["/privacy", "Privacy"], ["/login", "Log in"]]} />
    </div>
  );
}
