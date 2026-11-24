import { MotionEffects } from "./motion";
import { Pricing } from "./pricing";
import { PricingAddons, PricingCompare } from "./pricing-compare";
import type { PublicPlan } from "@/lib/plans";
import s from "./landing.module.css";

/** The standalone /pricing page: plan cards, a detailed comparison table and the add-ons. */
export function PricingPage({ plans, signedInHref }: { plans: PublicPlan[]; signedInHref: string | null }) {
  return (
    <div className={s.page}>
      <MotionEffects />
      <header className={s.nav}>
        <div className={`${s.wrap} ${s.navInner}`}>
          <a className={s.brand} href="/"><img src="/branding/sciprospect-a-icon-white.png" alt="" />SciProspect</a>
          <nav className={s.links} aria-label="Pricing"><a href="#pricing">Pricing</a><a href="#comparison">Compare plans</a><a href="#addons">Add-ons</a></nav>
          <div className={s.actions}>
            {signedInHref ? <a className={s.btn} href={signedInHref}>Open workspace <span className={s.arrow}>→</span></a> : <>
              <a className={s.btnGhost} href="/login">Log in</a>
              <a className={s.btn} href="/signup">Start free trial <span className={s.arrow}>→</span></a>
            </>}
          </div>
        </div>
      </header>

      <main>
        <section id="pricing" className={s.section}>
          <div className={s.wrap}>
            <div className={s.head} data-reveal="">
              <span className={s.kicker}>Pricing</span>
              <h2>Simple plans that grow with you</h2>
              <p>Start with a 7-day free trial for one account. Collect up to 1,000 contacts a day.</p>
            </div>
            <Pricing plans={plans} signedIn={!!signedInHref} compareHref="#comparison" />
          </div>
        </section>
        <PricingCompare plans={plans} />
        <PricingAddons />
      </main>

      <footer className={s.footer}>
        <div className={s.wrap}>
          <span>© {new Date().getFullYear()} SciProspect</span>
          <span><a href="/">Home</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/login">Log in</a></span>
        </div>
      </footer>
    </div>
  );
}
