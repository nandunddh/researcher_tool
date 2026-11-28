"use client";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { Icon, type IconName } from "@/components/icon";
import { LoadingIndicator } from "@/components/loading-indicator";
import { ChangePasswordDialog } from "@/components/change-password";
import { TwoStepDialog } from "@/components/two-step";
import { share, usd, usedOf, type Interval, type PublicPlan } from "@/lib/plans";
import s from "./account.module.css";

type Overview = { client_name: string; client_email: string; org_name?: string; tier: string; status: string; days_left: string; expires_at: string;
  daily_limit: number; used_today: number; seat_limit: number; members: unknown[]; scistudio_access: boolean };
type Billing = { plan: PublicPlan | null; license: { expired: boolean; expires_at: string | null; days_left: string | null };
  subscription: { status: string; interval: Interval; current_period_end: string | null; cancel_at_period_end: boolean } | null;
  invoices: { id: number; number: string; amount: number; currency: string; status: string; created_at: string }[] };
type PlanUsage = { plan: { limits: Record<string, number | boolean> } | null; usage: Record<string, number> | null };

const day = (iso?: string | null) => (iso ? new Date(iso.replace(" UTC", "Z").replace(" ", "T")).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "—");
const money = (n: number, currency: string) => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n); } catch { return `${currency} ${n.toFixed(2)}`; } };

function Card({ icon, title, action, children }: { icon: IconName; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={s.card}>
      <header className={s.cardHead}><span className={s.cardIcon}><Icon name={icon} size={18} /></span><h2>{title}</h2>{action}</header>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className={s.row}><dt>{label}</dt><dd>{children}</dd></div>;
}

function Meter({ label, used, limit, text }: { label: string; used: number; limit: number; text: string }) {
  const part = share(used, limit);
  return (
    <div className={s.meter}>
      <div className={s.meterTop}><span>{label}</span><b>{text}</b></div>
      {part !== null && <div className={s.bar} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(part * 100)}><i style={{ width: `${part * 100}%` }} /></div>}
    </div>
  );
}

/** Everything about the account on one page: profile, plan, usage, security and billing. */
export function Account({ namespace }: { namespace: "client" | "organization" }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [usage, setUsage] = useState<PlanUsage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<"" | "password" | "twostep">("");

  useEffect(() => {
    Promise.allSettled([api<Overview>(`/api/${namespace}/overview`), api<Billing>("/api/billing"), api<PlanUsage>("/api/plan")])
      .then(([o, b, u]) => {
        if (o.status === "fulfilled") setOverview(o.value); else setError("Your account details could not be loaded. Please refresh the page.");
        if (b.status === "fulfilled") setBilling(b.value);
        if (u.status === "fulfilled") setUsage(u.value);
      })
      .finally(() => setLoading(false));
  }, [namespace]);

  if (loading) return <LoadingIndicator label="Loading your account…" />;
  if (!overview) return <p className="alert" role="alert">{error}</p>;

  const limits = usage?.plan?.limits ?? {};
  const used = usage?.usage ?? {};
  const sub = billing?.subscription;
  const planName = billing?.plan?.name ?? overview.tier;
  const onTrial = overview.tier === "trial";

  return (
    <div className={s.page}>
      <div className={s.grid}>
        <Card icon="user" title="Profile">
          <dl className={s.rows}>
            <Row label="Name">{overview.client_name}</Row>
            <Row label="Email">{overview.client_email}</Row>
            {namespace === "organization" && <Row label="Organization">{overview.org_name || "—"}</Row>}
            <Row label="Account type">{namespace === "organization" ? "Organization (team)" : "Individual researcher"}</Row>
            <Row label="Status"><span className={s.pill} data-tone={overview.status === "active" ? "green" : "red"}>{overview.status}</span></Row>
          </dl>
        </Card>

        <Card icon="calendar" title="Plan" action={<a className={s.linkBtn} href="/billing">{onTrial ? "Upgrade" : "Change plan"}</a>}>
          <div className={s.planName}>{planName}{onTrial && <span className={s.pill} data-tone="lime">Free trial</span>}</div>
          <dl className={s.rows}>
            <Row label="Time left">{overview.days_left}</Row>
            <Row label="Valid until">{overview.expires_at === "never" ? "No end date" : day(overview.expires_at)}</Row>
            {sub && <Row label="Billing">{sub.interval === "year" ? "Yearly" : "Monthly"}{billing?.plan ? ` · ${usd(sub.interval === "year" ? billing.plan.price_year : billing.plan.price_month)}` : ""}</Row>}
            {sub && <Row label={sub.cancel_at_period_end ? "Ends on" : "Renews on"}>{day(sub.current_period_end)}</Row>}
            <Row label="SciStudio">{overview.scistudio_access ? "Included" : "Not in this plan"}</Row>
          </dl>
        </Card>

        <Card icon="bolt" title="Usage">
          <div className={s.meters}>
            <Meter label="Contacts today" used={overview.used_today} limit={overview.daily_limit}
              text={overview.daily_limit < 0 ? `${overview.used_today || 0} · unlimited` : `${(overview.used_today || 0).toLocaleString()} of ${overview.daily_limit.toLocaleString()}`} />
            {"storage_mb" in limits && <Meter label="File storage" used={used.storage_mb ?? 0} limit={Number(limits.storage_mb)} text={usedOf(used.storage_mb ?? 0, Number(limits.storage_mb))} />}
            {"data_storage_mb" in limits && <Meter label="Data storage" used={used.data_storage_mb ?? 0} limit={Number(limits.data_storage_mb)} text={usedOf(used.data_storage_mb ?? 0, Number(limits.data_storage_mb))} />}
            {"websites" in limits && <Meter label="Websites" used={used.websites ?? 0} limit={Number(limits.websites)} text={Number(limits.websites) < 0 ? `${used.websites ?? 0} · unlimited` : `${used.websites ?? 0} of ${limits.websites}`} />}
            <Meter label="Team seats" used={overview.members.length} limit={overview.seat_limit} text={overview.seat_limit > 0 ? `${overview.members.length} of ${overview.seat_limit}` : "No team seats in this plan"} />
          </div>
        </Card>

        <Card icon="lock" title="Security">
          <div className={s.actions}>
            <button type="button" className={s.action} onClick={() => setDialog("twostep")}>
              <span><b>Two-step sign-in</b><small>Authenticator app and backup codes</small></span><Icon name="next" size={16} />
            </button>
            <button type="button" className={s.action} onClick={() => setDialog("password")}>
              <span><b>Password</b><small>Change your sign-in password</small></span><Icon name="next" size={16} />
            </button>
          </div>
        </Card>

        <Card icon="receipt" title="Billing" action={<a className={s.linkBtn} href="/billing#invoices">All invoices</a>}>
          {billing?.invoices.length ? (
            <ul className={s.invoices}>
              {billing.invoices.slice(0, 4).map((inv) => (
                <li key={inv.id}><span><b>{inv.number}</b><small>{day(inv.created_at)}</small></span><span><b>{money(inv.amount, inv.currency)}</b><small>{inv.status}</small></span></li>
              ))}
            </ul>
          ) : (
            <p className={s.muted}>No invoices yet. {onTrial ? "Your trial is free; invoices appear here once you choose a plan." : ""}</p>
          )}
          <a className={s.primary} href="/billing"><Icon name="doc" size={16} /> Billing &amp; plan</a>
        </Card>
      </div>

      {dialog === "password" && <ChangePasswordDialog onClose={() => setDialog("")} />}
      {dialog === "twostep" && <TwoStepDialog onClose={() => setDialog("")} />}
    </div>
  );
}
