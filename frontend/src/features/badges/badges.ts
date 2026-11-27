/** Name badges: sizes, how many fit on a sheet, and the people printed on them (registrations, speakers, CSV). */

export type BadgeSize = { id: string; label: string; width: number; height: number };
export type Paper = { id: string; label: string; width: number; height: number };
export type Person = { code: string; name: string; organization: string; role: string; source: "registration" | "speaker" | "csv" | "manual"; photo?: string; detail?: string };

/** Millimetres. Portrait unless the name says otherwise. */
export const BADGE_SIZES: BadgeSize[] = [
  { id: "a6", label: "A6 (105 × 148 mm)", width: 105, height: 148 },
  { id: "4x3", label: "4 × 3 in landscape (102 × 76 mm)", width: 101.6, height: 76.2 },
  { id: "cr80", label: "Card, CR80 (54 × 86 mm)", width: 54, height: 85.6 },
];
export const PAPERS: Paper[] = [
  { id: "a4", label: "A4", width: 210, height: 297 },
  { id: "letter", label: "US Letter", width: 215.9, height: 279.4 },
];

export const ROLE_COLORS: Record<string, string> = {
  Attendee: "#4f46e5", Speaker: "#db2777", Organiser: "#059669", Sponsor: "#d97706", Student: "#0891b2", Press: "#475569", Staff: "#7c3aed",
};
export const ROLES = Object.keys(ROLE_COLORS);

/** How many badges fit on one sheet without margins (cut along the outlines); the grid is centred on the sheet. */
export function fit(paper: Paper, size: BadgeSize): { cols: number; rows: number; perSheet: number } {
  const cols = Math.floor((paper.width + 0.01) / size.width), rows = Math.floor((paper.height + 0.01) / size.height);
  return { cols, rows, perSheet: cols * rows };
}

export function sheets<T>(items: T[], perSheet: number): T[][] {
  if (perSheet < 1) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += perSheet) out.push(items.slice(i, i + perSheet));
  return out;
}

const text = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const field = (data: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const item = data[key];
    const value = item && typeof item === "object" ? text((item as { value?: unknown }).value) : text(item);
    if (value) return value;
  }
  return "";
};

type Submission = { id: number; form_type: string; status: string; ticket?: string; data: Record<string, unknown> };

/** Registrations become badges with their registration type; unpaid ones are left out unless asked for. */
export function fromRegistrations(submissions: Submission[], includeUnpaid = false): Person[] {
  return submissions
    .filter(s => s.form_type === "registration" && (includeUnpaid || /paid/i.test(s.status) && !/awaiting/i.test(s.status)))
    .map(s => ({ code: `R${s.id}`, name: field(s.data, "name", "full_name"), organization: field(s.data, "organization", "organisation", "institution", "affiliation"),
      role: /student/i.test(s.ticket ?? "") ? "Student" : "Attendee", source: "registration" as const, detail: text(s.ticket) }))
    .filter(p => p.name);
}

export function fromSpeakers(speakers: unknown): Person[] {
  if (!Array.isArray(speakers)) return [];
  return speakers.flatMap((raw, i) => {
    if (!raw || typeof raw !== "object") return [];
    const s = raw as Record<string, unknown>;
    const name = text(s.name);
    if (!name) return [];
    const id = text(s.id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 30) || `S${i + 1}`;
    return [{ code: `S-${id}`, name, organization: text(s.affiliation), role: "Speaker", source: "speaker" as const, photo: text(s.photo) || undefined, detail: s.keynote === true ? "Keynote" : "" }];
  });
}

/** CSV with a header row; quoted fields, commas or semicolons, and Excel's byte-order mark are handled. */
export function parseCsv(input: string): string[][] {
  const source = input.replace(/^﻿/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}

const HEADERS: Record<keyof Pick<Person, "name" | "organization" | "role">, RegExp> = {
  name: /^(full ?name|name|participant|attendee)$/i,
  organization: /^(organi[sz]ation|institution|affiliation|company|university)$/i,
  role: /^(role|type|category|badge|ticket)$/i,
};

/** People from a CSV file. The first row must name the columns; a "Name" column is required. */
export function fromCsv(input: string, newCode: () => string): { people: Person[]; problem?: string } {
  const [header, ...rows] = parseCsv(input);
  if (!header) return { people: [], problem: "The file is empty." };
  const col = (key: keyof typeof HEADERS) => header.findIndex(h => HEADERS[key].test(h.trim()));
  const name = col("name"), org = col("organization"), role = col("role");
  if (name < 0) return { people: [], problem: "Add a header row with a “Name” column (and optionally Organization and Role)." };
  if (rows.length > 5000) return { people: [], problem: "Up to 5,000 people per file." };
  const people = rows.map(r => {
    const asked = role >= 0 ? text(r[role]) : "";
    const known = ROLES.find(x => x.toLowerCase() === asked.toLowerCase());
    return { code: newCode(), name: text(r[name]), organization: org >= 0 ? text(r[org]) : "", role: known ?? "Attendee", source: "csv" as const, detail: known ? "" : asked };
  }).filter(p => p.name);
  return { people };
}

/** A short random badge code for people without a registration, e.g. "B7F3A9C21". */
export function randomCode(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return "B" + Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}
