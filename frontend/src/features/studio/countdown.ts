/** Date maths for the countdown block. Dates are whole days (YYYY-MM-DD) counted from the start of that day in UTC. */
export type Remaining = { days: number; hours: number; minutes: number; seconds: number };

/** Milliseconds for a real calendar date written YYYY-MM-DD, or null for anything else (2026-02-30, "tomorrow", empty). */
export function parseDay(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  const [y, m, d] = value.trim().split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d);
  const check = new Date(ms);
  return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d ? ms : null;
}

/** Time left until the target, or null once it has been reached. */
export function remaining(targetMs: number, nowMs: number): Remaining | null {
  const left = Math.floor((targetMs - nowMs) / 1000);
  if (!Number.isFinite(left) || left <= 0) return null;
  return { days: Math.floor(left / 86400), hours: Math.floor((left % 86400) / 3600), minutes: Math.floor((left % 3600) / 60), seconds: left % 60 };
}

/** "14 October 2027", the same for every visitor whatever their time zone. */
export function longDate(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(ms);
}

/** The link that opens a place in OpenStreetMap, or null when there is nothing to search for. */
export function mapLink(name: string, address: string): string | null {
  const query = [name, address].map(part => part.replace(/\s+/g, " ").trim()).filter(Boolean).join(", ");
  return query ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}` : null;
}
