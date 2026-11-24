import type { ReactNode } from "react";
import { count, usd, type PublicPlan } from "@/lib/plans";
import s from "./landing.module.css";

type MarkKind = "yes" | "no" | "soon";
type Cell = ReactNode | { mark: MarkKind };
const isMark = (v: unknown): v is { mark: MarkKind } => typeof v === "object" && v !== null && "mark" in v;
const YES: Cell = { mark: "yes" }, NO: Cell = { mark: "no" }, SOON: Cell = { mark: "soon" };

const size = (mb: unknown) => (typeof mb !== "number" ? "" : mb < 0 ? "Unlimited" : mb >= 1000 ? `${mb / 1000} GB` : `${mb} MB`);
// How far the website expansion add-on will reach. Shown with a "coming soon" tag: the add-on is not on sale yet.
const EXPANDS_TO: Record<string, number> = { basic: 5, pro: 7, ultra: 15 };

function Mark({ mark }: { mark: MarkKind }) {
  if (mark === "soon") return <span className={s.soon}>Coming soon</span>;
  return <span className={mark === "yes" ? s.yes : s.no}><span aria-hidden="true">{mark === "yes" ? "✓" : "✕"}</span><span className={s.sr}>{mark === "yes" ? "Included" : "Not included"}</span></span>;
}

/** The detailed plan comparison. Numbers come from the plans themselves, so the Plans page in root changes this table too. */
export function PricingCompare({ plans }: { plans: PublicPlan[] }) {
  const paid = plans.filter(p => p.kind === "paid");
  const custom = plans.find(p => p.kind === "custom");
  if (!paid.length) return null;
  const lim = (p: PublicPlan, key: string) => p.limits[key];
  const users = (p: PublicPlan) => Number(lim(p, "members")) + 1;
  const row = (label: string, cells: (p: PublicPlan) => Cell, customCell: Cell): { label: string; cells: Cell[] } => ({ label, cells: [...paid.map(cells), customCell] });
  const quote = "By quote", agreement = "By agreement", capacity = "Custom capacity";

  const groups: { title: string; rows: { label: string; cells: Cell[] }[] }[] = [
    { title: "Pricing and capacity", rows: [
      row("Monthly price", p => usd(p.price_month), quote),
      row("Annual price", p => usd(p.price_year), quote),
      row("Included users", p => users(p), agreement),
      row("Daily contacts per user", p => count(lim(p, "daily_contacts")), agreement),
      row("Daily total with all seats active", p => (Number(lim(p, "daily_contacts")) < 0 ? "Unlimited" : (users(p) * Number(lim(p, "daily_contacts"))).toLocaleString("en-US")), agreement),
    ] },
    { title: "Research tools", rows: [
      row("Contact discovery and source evidence", () => YES, YES),
      row("Email-domain checks and status filters", () => YES, YES),
      row("CSV export", () => YES, YES),
    ] },
    { title: "Event websites", rows: [
      row("Websites included", p => count(lim(p, "websites")), agreement),
      row("Maximum websites with expansion", p => (EXPANDS_TO[p.id] ? <>Up to {EXPANDS_TO[p.id]} <span className={s.soon}>add-on coming soon</span></> : ""), agreement),
      row("Pages per website", p => count(lim(p, "pages")), agreement),
      row("Publishing address", p => (lim(p, "custom_domain") === true ? (p.id === "ultra" ? "Custom domain per event" : "Custom domain") : "SciProspect subdomain"), agreement),
      row("Visual builder and speaker profiles", () => YES, YES),
      row("Registration and abstract submissions", () => YES, YES),
      row("Form submissions", p => (Number(lim(p, "submissions_month")) < 0 ? "Unlimited" : `${count(lim(p, "submissions_month"))} a month`), "Unlimited"),
    ] },
    { title: "Storage per account", rows: [
      row("Files and media", p => size(lim(p, "storage_mb")), capacity),
      row("Contacts, evidence and form records", p => size(lim(p, "data_storage_mb")), capacity),
    ] },
    { title: "Infrastructure", rows: [
      row("Dedicated application instance", () => NO, YES),
      row("Dedicated workspace database", p => (p.id === "ultra" ? SOON : NO), YES),
      row("Private database infrastructure", () => NO, YES),
      row("Application hosting", () => "Shared", "Dedicated instance"),
      row("Database", p => (p.id === "ultra" ? "Shared today · dedicated workspace database coming soon" : "Shared with workspace controls"), "Private database infrastructure"),
    ] },
  ];

  return (
    <section className={s.compare} id="comparison">
      <div className={s.wrap}>
        <h2>Compare plans in detail</h2>
        <div className={s.matrix} tabIndex={0} role="region" aria-label="Scrollable plan comparison">
          <table>
            <caption>Features and allowances per account · ✓ Included · ✕ Not included</caption>
            <thead><tr><th scope="col">Feature</th>{paid.map(p => <th scope="col" key={p.id}>{p.name}</th>)}<th scope="col">{custom?.name ?? "Custom"}</th></tr></thead>
            {groups.map(g => (
              <tbody key={g.title}>
                <tr><th className={s.group} colSpan={paid.length + 2} scope="rowgroup">{g.title}</th></tr>
                {g.rows.map(r => (
                  <tr key={r.label}><th scope="row">{r.label}</th>{r.cells.map((c, i) => <td key={i}>{isMark(c) ? <Mark mark={c.mark} /> : c}</td>)}</tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
        <p className={s.tableNote}>Each included user gets their own daily limit as team collecting rolls out; until then the limit applies to the account owner. Items marked “Coming soon” are not available yet.</p>
      </div>
    </section>
  );
}

/** Add-ons are shown with their prices but are not purchasable yet. */
export function PricingAddons() {
  return (
    <section className={s.compare} id="addons">
      <div className={s.wrap}>
        <h2>Optional add-ons</h2>
        <div className={s.addons}>
          <div><h3>Storage expansion <span className={s.soon}>Coming soon</span></h3><p>10 GB extra file storage · $3/month<br />10 GB extra data storage · $5/month</p></div>
          <div><h3>Mailbox verification <span className={s.soon}>Coming soon</span></h3><p>500 checks · $15 &nbsp;|&nbsp; 2,000 · $49 &nbsp;|&nbsp; 10,000 · $179<br />Prepaid credits carry forward. Unknown results use zero credits.</p></div>
        </div>
        <p className={s.tableNote}>All prices in USD per account.</p>
      </div>
    </section>
  );
}
