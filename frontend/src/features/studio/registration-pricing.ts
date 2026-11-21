/** Registration pricing rules shared by the form, the editor and tests. Mirrors backend/forms.py (the server decides the real price). */
type Rec = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const recs = (v: unknown): Rec[] => (Array.isArray(v) ? v.filter((x): x is Rec => !!x && typeof x === "object") : []);

/** The owner's price periods by end date (open-ended last) and the one that applies today, or null when closed. */
export function currentPeriod(d: Rec, today = new Date().toISOString().slice(0, 10)): Rec | null {
  const periods = recs(d.periods).filter(p => str(p.id))
    .sort((a, b) => Number(!str(a.ends)) - Number(!str(b.ends)) || str(a.ends).localeCompare(str(b.ends)));
  return periods.find(p => !str(p.ends) || today <= str(p.ends)) ?? null;
}

/** A type's price in a period, or null when it is not offered then (left blank). */
export function priceIn(category: Rec | undefined, periodId: string): number | null {
  const prices = category?.prices && typeof category.prices === "object" ? category.prices as Rec : {};
  const v = prices[periodId];
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** "" → null (not offered); otherwise a price with at most 2 decimals, or undefined when the text is not a price. */
export function parsePrice(text: string): number | null | undefined {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  if (!/^\d{1,7}(\.\d{0,2})?$/.test(t)) return undefined;
  return Math.round(Number(t) * 100) / 100;
}

/** A registration form on a site with Event details uses them: periods, currency, and the ticked
 *  ticket types / add-ons / discount codes (no saved list = all). Mirrors backend/forms.py with_event. */
export function registrationData(data: Rec, event?: Rec): Rec {
  if (!event || !recs(event.tickets).length) return data;
  const pick = (items: unknown, key: string) => {
    const chosen = data[key];
    return Array.isArray(chosen) ? recs(items).filter(i => chosen.includes(i.id)) : recs(items);
  };
  const basics = event.basics && typeof event.basics === "object" ? event.basics as Rec : {};
  return { ...data, currency: str(basics.currency) || "USD", periods: recs(event.periods),
    categories: pick(event.tickets, "ticket_ids"), addons: pick(event.addons, "addon_ids"), discount_codes: pick(event.discounts, "discount_ids") };
}
