import { MotionEffects } from "./motion";
import { MarketingFooter, MarketingHeader } from "./site-chrome";
import { Pricing } from "./pricing";
import { PricingAddons, PricingCompare, PricingPrint } from "./pricing-compare";
import type { PublicPlan } from "@/lib/plans";
import s from "./landing.module.css";

/** The standalone /pricing page: plan cards, a detailed comparison table and the add-ons. */
export function PricingPage({ plans, signedInHref }: { plans: PublicPlan[]; signedInHref: string | null }) {
  return (
    <div className={s.page}>
      <MotionEffects />
      <MarketingHeader label="Pricing" signedInHref={signedInHref}
        links={[["#pricing", "Pricing"], ["#comparison", "Compare plans"], ["#print", "Print tools"], ["#addons", "Add-ons"]]} />

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
        <PricingPrint />
        <PricingAddons />
      </main>

      <MarketingFooter links={[["/", "Home"], ["/terms", "Terms"], ["/privacy", "Privacy"], ["/login", "Log in"]]} />
    </div>
  );
}
