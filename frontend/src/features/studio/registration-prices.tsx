"use client";
import { useEffect, useState } from "react";
import { parsePrice } from "./registration-pricing";

type Rec = Record<string, unknown>;

/** Text box that lets people type "99." on the way to "99.50" and only stores valid prices. */
export function PriceInput({ value, disabled, label, onChange, allowBlank = true }: { value: unknown; disabled?: boolean; label: string; allowBlank?: boolean; onChange: (v: number | null) => void }) {
  const shown = typeof value === "number" ? String(value) : "";
  const [text, setText] = useState(shown);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(shown); }, [shown, focused]);
  const parsed = parsePrice(text);
  return (
    <input aria-label={label} inputMode="decimal" value={text} disabled={disabled} placeholder={allowBlank ? "—" : "0"}
      aria-invalid={parsed === undefined || undefined} style={{ width: "100%", minWidth: 80 }}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onChange={e => {
        setText(e.target.value);
        const p = parsePrice(e.target.value);
        if (p !== undefined && (p !== null || allowBlank)) onChange(p);
      }} />
  );
}

/** Price grid: one row per ticket type, one column per price period. Blank = not offered then. */
export function PriceGrid({ periods, tickets, currency, disabled, onSet }: {
  periods: Rec[]; tickets: Rec[]; currency: string; disabled?: boolean; onSet: (row: number, periodId: string, value: number | null) => void;
}) {
  if (!periods.length || !tickets.length) return <p style={{ color: "var(--muted, #6b7280)", fontSize: 13 }}>Add at least one price period and one ticket type to set prices.</p>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "6px 8px" }}>Ticket type</th>
            {periods.map(p => <th key={String(p.id)} style={{ textAlign: "left", padding: "6px 8px", whiteSpace: "nowrap" }}>{String(p.name || "Period")} ({currency})</th>)}
          </tr>
        </thead>
        <tbody>
          {tickets.map((type, row) => {
            const prices = type.prices && typeof type.prices === "object" ? type.prices as Rec : {};
            return (
              <tr key={String(type.id ?? row)} style={{ borderTop: "1px solid var(--line, #e5e7eb)" }}>
                <th scope="row" style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600 }}>{String(type.name || `Type ${row + 1}`)}</th>
                {periods.map(p => (
                  <td key={String(p.id)} style={{ padding: "4px 6px" }}>
                    <PriceInput value={prices[String(p.id)]} disabled={disabled} label={`${String(type.name)} price, ${String(p.name)}`}
                      onChange={v => onSet(row, String(p.id), v)} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
