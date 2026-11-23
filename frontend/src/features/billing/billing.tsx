"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api } from "@/lib/api";
import { AuthBackdrop } from "@/features/marketing/auth-backdrop";
import { ConfirmDialog } from "@/components/confirm-dialog";
import styles from "./billing.module.css";

type Plan = { id: string; name: string; price_month: number; limits: Record<string, number | boolean> };
type Subscription = { plan_id: string; status: string; current_period_end: string | null; cancel_at_period_end: boolean; provider: string } | null;
type Invoice = { id: number; number: string; plan_id: string; amount: number; currency: string; status: string; period_start: string; period_end: string; created_at: string };
type Overview = { provider: "test" | "stripe"; plan: Plan | null; subscription: Subscription; invoices: Invoice[]; plans: Plan[] };

const money = (n: number, currency = "USD") => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n); } catch { return `${currency} ${n.toFixed(2)}`; } };
const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "");
const unlimited = (n: unknown, unit = "") => (typeof n === "number" && n < 0 ? "Unlimited" : `${n}${unit}`);

function Shell({ children, back = "/" }: { children: ReactNode; back?: string }) {
  return (
    <div className={styles.page}>
      <div className={styles.noPrint}><AuthBackdrop /></div>
      <header className={styles.top}><div className={styles.topInner}>
        <a className={styles.brand} href="/"><img src="/branding/sciprospect-a-icon.png" alt="" />SciProspect</a>
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
  const [confirming, setConfirming] = useState<"cancel" | "downgrade" | null>(null);
  useEffect(() => {
    try { const saved = sessionStorage.getItem(NOTICE_KEY); if (saved) { setNotice(saved); sessionStorage.removeItem(NOTICE_KEY); } } catch { /* private mode */ }
  }, []);

  const load = () => api<Overview>("/api/billing").then(setData).catch(e => setError(e instanceof Error ? e.message : "Billing could not be loaded."));
  useEffect(() => { void load(); }, []);

  async function choose(plan: Plan) {
    setBusy(plan.id); setError("");
    try {
      const result = await api<{ url?: string; message?: string }>("/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan_id: plan.id }) });
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
                <strong>{data.plan?.name ?? "Free"}</strong>
                {active && <span className={styles.badge} data-tone={sub?.cancel_at_period_end ? "warn" : undefined}>{sub?.cancel_at_period_end ? "Ends soon" : "Active"}</span>}
                <p className={styles.muted}>
                  {active && sub?.cancel_at_period_end && `Your plan ends on ${day(sub.current_period_end)}. After that you move to Free.`}
                  {active && !sub?.cancel_at_period_end && `Renews on ${day(sub?.current_period_end)} for ${money(data.plan?.price_month ?? 0)}.`}
                  {!active && "No payment needed. Upgrade any time."}
                </p>
              </div>
              {active && (sub?.cancel_at_period_end
                ? <button type="button" className={styles.primary} disabled={!!busy} onClick={() => void cancel(true)}>Keep my plan</button>
                : <button type="button" className={styles.danger} disabled={!!busy} onClick={() => setConfirming("cancel")}>Cancel subscription</button>)}
            </div>
          </section>

          <section className={styles.card}>
            <h2>Plans</h2>
            <div className={styles.plans}>
              {data.plans.map(p => {
                const current = p.id === (data.plan?.id ?? "free");
                return (
                  <article key={p.id} className={styles.plan} data-current={current || undefined} data-highlight={p.id === highlight && !current || undefined}>
                    <h3>{p.name}</h3>
                    <div className={styles.price}>{p.price_month > 0 ? money(p.price_month) : "Free"}{p.price_month > 0 && <small> / month</small>}</div>
                    <ul>
                      <li>{unlimited(p.limits.websites)} website{p.limits.websites === 1 ? "" : "s"}, {unlimited(p.limits.pages)} page{p.limits.pages === 1 ? "" : "s"} each</li>
                      <li>{Number(p.limits.members) === 0 ? "Just you" : `${unlimited(p.limits.members)} team members`}</li>
                      <li>{Number(p.limits.submissions_month) < 0 ? "Unlimited form submissions" : `${p.limits.submissions_month} form submissions / month`}</li>
                    </ul>
                    {current ? <button type="button" className={styles.secondary} disabled>Current plan</button>
                      : p.price_month > 0
                        ? <button type="button" className={styles.primary} disabled={!!busy} onClick={() => void choose(p)}>{busy === p.id ? "Opening…" : active ? `Switch to ${p.name}` : `Upgrade to ${p.name}`}</button>
                        : active ? <button type="button" className={styles.secondary} disabled={!!busy || sub?.cancel_at_period_end} onClick={() => setConfirming("downgrade")}>{sub?.cancel_at_period_end ? "Scheduled" : "Downgrade to Free"}</button>
                          : null}
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
            title={confirming === "cancel" ? "Cancel your subscription?" : "Move to Free?"}
            description={confirming === "cancel"
              ? `You keep your plan until ${day(sub?.current_period_end)}. After that you move to Free, and you can upgrade again at any time.`
              : `Your plan stays active until ${day(sub?.current_period_end)}. After that you move to Free.`}
            label={confirming === "cancel" ? "Cancel subscription" : "Move to Free"}
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
  const [session, setSession] = useState<{ plan_name: string; amount: number; currency: string; status: string; email: string } | null>(null);
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
          <div className={styles.amount}>{session ? money(session.amount, session.currency) : "…"} <small>per month</small></div>
          <div className={styles.lineItem}><span>{session?.plan_name} plan · billed monthly</span><span>{session && money(session.amount, session.currency)}</span></div>
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
