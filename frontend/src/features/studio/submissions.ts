/** Form submissions: shared types and CSV export (no UI, so tests can import it). */
export type Submission = {
  id: number; form_id: string; form_type: string; page_id: string | null; status: string; created_at: string;
  data: Record<string, { label: string; value: string | boolean }>;
};

export const show = (v: string | boolean) => (typeof v === "boolean" ? (v ? "Yes" : "No") : v);

/** CSV with one column per field label; quotes everything so commas and newlines are safe. */
export function toCsv(rows: Submission[]): string {
  const labels = [...new Set(rows.flatMap(r => Object.values(r.data).map(f => f.label)))];
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["Date", "Form", ...labels].map(cell).join(",")];
  for (const r of rows) {
    const byLabel = Object.fromEntries(Object.values(r.data).map(f => [f.label, show(f.value)]));
    lines.push([r.created_at, r.form_type, ...labels.map(l => byLabel[l] ?? "")].map(cell).join(","));
  }
  return lines.join("\r\n");
}

