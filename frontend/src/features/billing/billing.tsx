"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api } from "@/lib/api";
import { AuthBackdrop } from "@/features/marketing/auth-backdrop";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { INTERVAL_KEY, planLines, priceFor, usd, yearlySaving, type Interval, type PublicPlan } from "@/lib/plans";
import styles from "./billing.module.css";

type Plan = PublicPlan;
type Subscription = { plan_id: string; status: string; current_period_end: string | null; cancel_at_period_end: boolean; provider: string; interval: Interval } | null;
type Invoice = { id: number; number: string; plan_id: string; amount: number; currency: string; status: string; period_start: string; period_end: string; created_at: string };
type License = { expired: boolean; tier: string; expires_at: string | null; days_left: string | null };
type Overview = { provider: "test" | "stripe"; plan: Plan | null; subscription: Subscription; invoices: Invoice[]; plans: Plan[]; license: License };

const money = (n: number, currency = "USD") => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n); } catch { return `${currency} ${n.toFixed(2)}`; } };
const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "");
/** The license stores "YYYY-MM-DD HH:MM:SS UTC". */
const licenseDay = (value?: string | null) => (value && value !== "never" ? day(value.replace(" UTC", "").replace(" ", "T") + "Z") : "");

function Shell({ children, back = "/" }: { children: ReactNode; back?: string }) {
  return (
    <div className={styles.page}>
      <div className={styles.noPrint}><AuthBackdrop /></div>
      <header className={styles.top}><div className={styles.topInner}>
        <a className={styles.brand} href="/"><img src="/branding/sciprospect-a-icon-white.png" alt="" />SciProspect</a>
        <a className={styles.back} href={back}>← Back to workspace</a>
      </div></header>
      <div className={styles.layer}>{children}</div>
    </div>
  );
}

/** The account owner's plan, renewal, invoices and plan changes. */
const NOTICE_KEY = "sciprospect:billing-notice";

/** Checkout returns here (/billing/success); it leaves a message for Billing and moves on to a clean /billing. */
export function PaymentSuccess() {
  useEffect(() => {
    try { sessionStorage.setItem(NOTICE_KEY, "Payment received. Your new plan is active, and the invoice is on its way to your email."); } catch { /* private mode */ }
    window.location.replace("/billing");
  }, []);
  return <Shell><main className={styles.main}><p className={styles.success} role="status">Payment received. Opening Billing…</p></main></Shell>;
}

export function Billing({ highlight, workspace }: { highlight: string; workspace: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState<"cancel" | null>(null);
  const [interval, setInterval] = useState<Interval>("month");
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(NOTICE_KEY); if (saved) { setNotice(saved); sessionStorage.removeItem(NOTICE_KEY); }
      const chosen = sessionStorage.getItem(INTERVAL_KEY); if (chosen === "year" || chosen === "month") setInterval(chosen);  // set by the pricing page
    } catch { /* private mode */ }
  }, []);

  // Open on the billing period the account already pays (an annual plan shows the annual prices first).
  useEffect(() => { if (data?.subscription?.status === "active") setInterval(data.subscription.interval); }, [data?.subscription?.status, data?.subscription?.interval]);

  const load = () => api<Overview>("/api/billing").then(setData).catch(e => setError(e instanceof Error ? e.message : "Billing could not be loaded."));
  useEffect(() => { void load(); }, []);

  async function choose(plan: Plan) {
    setBusy(plan.id); setError("");
    try {
      const result = await api<{ url?: string; message?: string }>("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan_id: plan.id, interval }) });
      if (result.url) { window.location.assign(result.url); return; }
      setNotice(result.message ?? "Plan changed."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    setBusy("");
  }
  async function cancel(resume: boolean) {
    setBusy("cancel"); setError("");
    try {
      await api("/api/billing/cancel", { method: "POST", body: JSON.stringify({ resume }) });
      setNotice(resume ? "Your subscription will continue." : "Your subscription will end at the end of this period. You keep everything until then.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    setBusy("");
  }

  const sub = data?.subscription, active = sub?.status === "active";
  const ended = !!data?.license.expired, onTrial = data?.plan?.kind === "trial";
  return (
    <Shell back={workspace}>
      <main className={styles.main}>
        <h1>Billing</h1>
        {data?.provider === "test" && <p className={styles.test}><strong>Test mode:</strong> payments are simulated and no money is charged. Use card 4242 4242 4242 4242.</p>}
        {notice && <p className={styles.success} role="status">{notice}</p>}
        {error && <p className={styles.alert} role="alert">{error}</p>}
        {!data && !error && <p>Loading…</p>}
        {data && <>
          <section className={styles.card}>
            <div className={styles.current}>
              <div>
                <span className={styles.muted}>Current plan</span><br />
                <strong>{data.plan?.name ?? "Free trial"}</strong>
                {active && <span className={styles.badge} data-tone={sub?.cancel_at_period_end ? "warn" : undefined}>{sub?.cancel_at_period_end ? "Ends soon" : "Active"}</span>}
                {!active && <span className={styles.badge} data-tone={ended ? "warn" : undefined}>{ended ? "Ended" : onTrial ? "Trial" : "Not offered"}</span>}
                <p className={styles.muted}>
                  {active && sub?.cancel_at_period_end && `Your plan ends on ${day(sub.current_period_end)}. After that your account is paused until you choose a plan.`}
                  {active && !sub?.cancel_at_period_end && `Renews on ${day(sub?.current_period_end)} for ${usd(data.plan ? priceFor(data.plan, sub?.interval ?? "month") : 0)} (${sub?.interval === "year" ? "billed yearly" : "billed monthly"}).`}
                  {!active && ended && `Your ${onTrial ? "7-day free trial" : "plan"} ended on ${licenseDay(data.license.expires_at)}. Choose a plan below to continue. Your contacts and websites are kept.`}
                  {!active && !ended && onTrial && `Your 7-day free trial ends on ${licenseDay(data.license.expires_at)} (${data.license.days_left} left). Choose a plan to keep going.`}
                  {!active && !ended && !onTrial && "This plan is no longer offered. Choose one of the plans below when you want to switch."}
                </p>
              </div>
              {active && (sub?.cancel_at_period_end
                ? <button type="button" className={styles.primary} disabled={!!busy} onClick={() => void cancel(true)}>Keep my plan</button>
                : <button type="button" className={styles.danger} disabled={!!busy} onClick={() => setConfirming("cancel")}>Cancel subscription</button>)}
            </div>
          </section>

          <section className={styles.card}>
            <h2>Plans</h2>
            <div className={styles.toggle} role="group" aria-label="Billing period">
              <button type="button" aria-pressed={interval === "month"} onClick={() => setInterval("month")}>Monthly</button>
              <button type="button" aria-pressed={interval === "year"} onClick={() => setInterval("year")}>Annual<em>Save 2 months</em></button>
            </div>
            <div className={styles.plans}>
              {data.plans.filter(p => p.kind !== "trial").map(p => {
                const current = p.id === data.plan?.id;
                const sameInterval = !active || sub?.interval === interval;
                return (
                  <article key={p.id} className={styles.plan} data-current={(current && sameInterval) || undefined} data-highlight={p.id === highlight && !current || undefined}>
                    <h3>{p.name}</h3>
                    {p.kind === "custom" ? <div className={styles.price}>Let&apos;s talk</div> : (
                      <div className={styles.price}>{usd(priceFor(p, interval))}<small> / {interval === "year" ? "year" : "month"}</small></div>
                    )}
                    {p.kind === "paid" && <p className={styles.muted}>{interval === "year" ? `Saves ${usd(yearlySaving(p))} a year` : `or ${usd(p.price_year)} a year`}</p>}
                    <ul>{planLines(p).map(line => <li key={line}>{line}</li>)}</ul>
                    {p.kind === "custom"
                      ? <a className={styles.secondary} href="mailto:hello@sciprospect.com?subject=SciProspect%20Custom%20plan">Contact sales</a>
                      : current && sameInterval ? <button type="button" className={styles.secondary} disabled>Current plan</button>
                        : <button type="button" className={styles.primary} disabled={!!busy} onClick={() => void choose(p)}>
                            {busy === p.id ? "Opening…" : active ? (current ? `Switch to ${interval === "year" ? "yearly" : "monthly"} billing` : `Switch to ${p.name}`) : `Choose ${p.name}`}
                          </button>}
                  </article>
                );
              })}
            </div>
          </section>

          <section className={styles.card}>
            <h2>Invoices</h2>
            {data.invoices.length ? (
              <table className={styles.table}>
                <thead><tr><th>Number</th><th>Date</th><th>Period</th><th>Amount</th><th /></tr></thead>
                <tbody>{data.invoices.map(i => (
                  <tr key={i.id}><td>{i.number}</td><td>{day(i.created_at)}</td><td>{day(i.period_start)} – {day(i.period_end)}</td>
                    <td>{money(i.amount, i.currency)}</td><td><a href={`/billing/invoices/${i.id}`} target="_blank" rel="noopener noreferrer">View / PDF</a></td></tr>
                ))}</tbody>
              </table>
            ) : <p className={styles.muted}>No invoices yet.</p>}
          </section>
        </>}
        {confirming && (
          <ConfirmDialog
            title="Cancel your subscription?"
            description={`You keep your plan until ${day(sub?.current_period_end)}. After that your account is paused until you choose a plan again. Your contacts and websites are kept.`}
            label="Cancel subscription"
            busy={busy === "cancel"}
            onCancel={() => setConfirming(null)}
            onConfirm={() => { setConfirming(null); void cancel(false); }}
          />
        )}
      </main>
    </Shell>
  );
}

/** Test provider's checkout page, laid out like Stripe Checkout. With Stripe on, people go to Stripe instead. */
export function TestCheckout({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<{ plan_name: string; amount: number; currency: string; status: string; email: string; interval: Interval } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<NonNullable<typeof session>>(`/api/billing/checkout/${encodeURIComponent(sessionId)}`).then(setSession).catch(e => setError(e instanceof Error ? e.message : "Checkout not found."));
  }, [sessionId]);

  async function pay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      await api(`/api/billing/checkout/${encodeURIComponent(sessionId)}/pay`, { method: "POST", body: JSON.stringify({ card_number: data.get("card"), expiry: data.get("expiry"), cvc: data.get("cvc"), name: data.get("name") }) });
      window.location.assign("/billing/success");
    } catch (e) { setError(e instanceof Error ? e.message : "Payment failed."); setBusy(false); }
  }

  return (
    <div className={styles.checkout}>
      <AuthBackdrop />
      <aside className={styles.summary}>
        <div>
          <a className={styles.back} href="/billing">← Back</a>
          <p className={styles.muted} style={{ marginTop: 24 }}>Subscribe to SciProspect {session?.plan_name}</p>
          <div className={styles.amount}>{session ? money(session.amount, session.currency) : "…"} <small>per {session?.interval === "year" ? "year" : "month"}</small></div>
          <div className={styles.lineItem}><span>{session?.plan_name} plan · billed {session?.interval === "year" ? "yearly" : "monthly"}</span><span>{session && money(session.amount, session.currency)}</span></div>
          <div className={styles.lineItem}><strong>Total due today</strong><strong>{session && money(session.amount, session.currency)}</strong></div>
        </div>
      </aside>
      <section className={styles.payPane}>
        <span className={styles.testBadge}>TEST MODE</span>
        {error && <p className={styles.alert} role="alert">{error}</p>}
        {session?.status && session.status !== "open" ? <p className={styles.success}>This checkout is already complete. <a href="/billing">Go to Billing</a></p> : (
          <form className={styles.payForm} onSubmit={pay}>
            <label>Email<input value={session?.email ?? ""} readOnly /></label>
            <label>Card number<input name="card" inputMode="numeric" autoComplete="cc-number" defaultValue="4242 4242 4242 4242" required /></label>
            <div className={styles.cardRow}>
              <label>Expiry (MM / YY)<input name="expiry" autoComplete="cc-exp" defaultValue="12 / 34" required /></label>
              <label>Security code<input name="cvc" inputMode="numeric" autoComplete="cc-csc" defaultValue="123" required /></label>
            </div>
            <label>Name on card<input name="name" autoComplete="cc-name" required /></label>
            <button className={styles.payButton} type="submit" disabled={busy || !session}>{busy ? "Processing…" : `Subscribe · ${session ? money(session.amount, session.currency) : ""}`}</button>
            <p className={styles.hint}>Test cards: <strong>4242 4242 4242 4242</strong> succeeds, <strong>4000 0000 0000 0002</strong> is declined. Any future date and any 3 digits. No money is charged. When Stripe is switched on, this page is replaced by Stripe&apos;s secure checkout. By subscribing you agree to the <a href="/terms" target="_blank" rel="noopener noreferrer">terms</a>; you can cancel any time from Billing.</p>
          </form>
        )}
      </section>
    </div>
  );
}

/** Printable invoice for a subscription payment. */
export function InvoiceView({ id }: { id: string }) {
  const [inv, setInv] = useState<(Invoice & { plan_name: string; customer: { name: string; organization: string; email: string } }) | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<NonNullable<typeof inv>>(`/api/billing/invoices/${encodeURIComponent(id)}`).then(setInv).catch(e => setError(e instanceof Error ? e.message : "Invoice not found.")); }, [id]);
  return (
    <Shell back="/billing">
      <div className={styles.printBar}><a className={styles.back} href="/billing">← Billing</a><button type="button" className={styles.primary} onClick={() => window.print()}>Download PDF / Print</button></div>
      {error && <p className={styles.alert} style={{ maxWidth: 760, margin: "0 auto" }} role="alert">{error}</p>}
      {inv && (
        <article className={styles.paper}>
          <header className={styles.paperTop}>
            <div className={styles.paperBrand}><img src="/branding/sciprospect-a-icon.png" alt="SciProspect" width={48} height={48} /><div><h1>SciProspect</h1><p className={styles.muted}>Research data and event websites</p></div></div>
            <div className={styles.paperNumber}><span className={styles.muted}>INVOICE</span><strong>{inv.number}</strong><span className={styles.badge}>Paid</span></div>
          </header>
          <section className={styles.paperMeta}>
            <div><h2>Billed to</h2><p>{inv.customer.name}</p>{inv.customer.organization && <p>{inv.customer.organization}</p>}<p>{inv.customer.email}</p></div>
            <div><h2>Details</h2><p>Issued {day(inv.created_at)}</p><p>Period {day(inv.period_start)} – {day(inv.period_end)}</p></div>
          </section>
          <table className={styles.table}>
            <thead><tr><th>Description</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
            <tbody><tr><td>SciProspect {inv.plan_name} plan, 1 month</td><td style={{ textAlign: "right" }}>{money(inv.amount, inv.currency)}</td></tr></tbody>
          </table>
          <p className={styles.paperTotal}>Total paid {money(inv.amount, inv.currency)}</p>
          <p className={styles.paperNote}>This invoice was generated automatically by SciProspect and is valid without a signature. Questions? Reply to the invoice email or contact us from your workspace.</p>
        </article>
      )}
    </Shell>
  );
}
