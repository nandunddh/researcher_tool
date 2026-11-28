"use client";
import { useState } from "react";
import { INTERVAL_KEY, cardLines, priceFor, usd, yearlySaving, type Interval, type PublicPlan } from "@/lib/plans";
import s from "./landing.module.css";

/** The pricing section: a card-free 7-day trial, then Basic / Pro / Ultra (monthly or annual) and a contact-sales Custom plan. */
export function Pricing({ plans, signedIn, compareHref }: { plans: PublicPlan[]; signedIn: boolean; compareHref?: string }) {
  const [interval, setInterval] = useState<Interval>("month");
  const trial = plans.find(p => p.kind === "trial");
  const paid = plans.filter(p => p.kind === "paid");
  const custom = plans.find(p => p.kind === "custom");
  const popular = paid.find(p => p.featured)?.id;
  const maxSaving = Math.max(0, ...paid.map(p => Math.round(yearlySaving(p) / Math.max(1, p.price_month))));

  // Signed-out visitors start the trial (with the plan remembered for checkout); signed-in owners go to Billing.
  const choose = () => { try { sessionStorage.setItem(INTERVAL_KEY, interval); } catch { /* private mode */ } };
  const hrefFor = (p: PublicPlan) => (signedIn ? `/billing/upgrade/${encodeURIComponent(p.id)}` : `/signup/${encodeURIComponent(p.id)}`);

  if (!paid.length) return <p className={s.note}>Plans are being updated. Please check back soon.</p>;
  return (
    <>
      {trial && !signedIn && (
        <div className={s.trialBand} data-reveal="">
          <div>
            <strong>Start your 7-day free trial</strong>
            <p>One account, one user, up to {trial.limits.daily_contacts?.toLocaleString("en-US")} new research contacts a day. No card needed. To continue after the 7 days, choose a plan.</p>
          </div>
          <div className={s.ctas}>
            <a className={s.btn} href="/signup">Start your free trial <span className={s.arrow}>→</span></a>
            <a className={s.btnGhost} href="/demo">Book a demo</a>
          </div>
        </div>
      )}

      <div className={s.toggle} role="group" aria-label="Billing period">
        <button type="button" aria-pressed={interval === "month"} onClick={() => setInterval("month")}>Monthly</button>
        <button type="button" aria-pressed={interval === "year"} onClick={() => setInterval("year")}>Annual{maxSaving > 0 && <em>Save {maxSaving === 2 ? "2 months" : `${maxSaving} months`}</em>}</button>
      </div>

      <div className={s.plans}>
        {paid.map((p, i) => {
          const price = priceFor(p, interval);
          return (
            <article key={p.id} className={s.plan} data-popular={p.id === popular || undefined} data-reveal="" style={{ "--d": `${i * .1}s` } as React.CSSProperties}>
              {p.id === popular && <span className={s.popular}>Most popular</span>}
              <h3>{p.name}</h3>
              <div className={s.price}>{usd(price)}<small> / {interval === "year" ? "year" : "month"}</small></div>
              <p className={s.priceNote}>{interval === "year" ? `Saves ${usd(yearlySaving(p))} a year` : `or ${usd(p.price_year)} a year`}</p>
              <ul>{cardLines(p).map(line => <li key={line}>{line}</li>)}</ul>
              <a className={p.id === popular ? s.btn : s.btnGhost} href={hrefFor(p)} onClick={choose}>Choose {p.name}</a>
            </article>
          );
        })}
        {custom && (
          <article className={s.plan} data-reveal="" style={{ "--d": `${paid.length * .1}s` } as React.CSSProperties}>
            <h3>{custom.name}</h3>
            <div className={`${s.price} ${s.priceWords}`}>Let&apos;s talk</div>
            <p className={s.priceNote}>Priced by quote</p>
            <ul>{cardLines(custom).map(line => <li key={line}>{line}</li>)}</ul>
            <a className={s.btnGhost} href="/demo">Book a demo</a>
          </article>
        )}
      </div>
      {compareHref && <p className={s.jump}><a href={compareHref}>Compare all features {compareHref.startsWith("#") ? "↓" : "→"}</a></p>}
    </>
  );
}
