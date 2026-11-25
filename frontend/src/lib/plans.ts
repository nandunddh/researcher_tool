/** Plans as the public pricing, sign-up and Billing screens show them (one place, so the numbers and wording never differ). */
export type Interval = "month" | "year";
export type PlanKind = "trial" | "paid" | "custom";
export type PublicPlan = {
  id: string; name: string; price_month: number; price_year: number; kind: PlanKind;
  limits: Record<string, number | boolean>; featured?: boolean;
};

/** The pricing page remembers the Monthly/Annual choice for the next screen (Billing) in this tab only, so URLs stay clean. */
export const INTERVAL_KEY = "sciprospect:interval";

const num = (v: unknown) => (typeof v === "number" ? v : 0);
export const count = (v: unknown) => (num(v) < 0 ? "Unlimited" : num(v).toLocaleString("en-US"));
const size = (mb: unknown) => (num(mb) < 0 ? "Unlimited" : num(mb) >= 1000 ? `${num(mb) / 1000} GB` : `${num(mb)} MB`);
const plural = (n: unknown, word: string) => `${count(n)} ${word}${n === 1 ? "" : "s"}`;

/** "120 MB of 4 GB" for a used amount and a limit, both in MB (limit below 0 = unlimited). */
export function usedOf(usedMb: number, limitMb: number): string {
  const size = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10} GB` : `${Math.round(n * 10) / 10} MB`);
  return limitMb < 0 ? `${size(usedMb)} of unlimited` : `${size(usedMb)} of ${size(limitMb)}`;
}
export const usd = (n: number) => (Number.isInteger(n) ? `$${n.toLocaleString("en-US")}` : `$${n.toFixed(2)}`);
export const priceFor = (plan: PublicPlan, interval: Interval) => (interval === "year" ? plan.price_year : plan.price_month);
/** What a year costs less than twelve months, e.g. $78 for Basic. */
export const yearlySaving = (plan: PublicPlan) => Math.max(0, plan.price_month * 12 - plan.price_year);

/** The feature lines of a plan, from its limits. */
export function planLines(plan: PublicPlan): string[] {
  const l = plan.limits;
  if (plan.kind === "custom") return ["Users, daily limits and storage by agreement", "Hosting and database set up for your organization", "Your own domain"];
  const users = num(l.members) < 0 ? "Unlimited users" : plural(num(l.members) + 1, "user");
  return [
    users,
    `${count(l.daily_contacts)} contacts a day per user`,
    `${plural(l.websites, "website")}, ${plural(l.pages, "page")} each`,
    `${size(l.storage_mb)} file storage`,
    `${size(l.data_storage_mb)} data storage`,
    num(l.submissions_month) < 0 ? "Unlimited form submissions" : `${count(l.submissions_month)} form submissions a month`,
    l.custom_domain === true ? "Your own domain" : "SciProspect subdomain",
  ];
}

/** The short list on a pricing card (the full comparison is a table below): users, contacts per user, websites. */
export function cardLines(plan: PublicPlan): string[] {
  const l = plan.limits;
  if (plan.kind === "custom") return ["Users and collection limits by agreement", "Tailored website and storage capacity", "Your own domain"];
  const users = num(l.members) < 0 ? "Unlimited users" : plural(num(l.members) + 1, "user");
  return [users, `${count(l.daily_contacts)} contacts per user per day`, `${plural(l.websites, "website")} · ${plural(l.pages, "page")} each`];
}
