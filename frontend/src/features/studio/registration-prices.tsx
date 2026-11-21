"use client";
import { useEffect, useState } from "react";
import type { Json } from "./document";
import { setSectionField, type EditorSite } from "./editor-model";
import type { Section } from "./document";
import styles from "./react-editor.module.css";
import { parsePrice } from "./registration-pricing";

type Rec = Record<string, unknown>;
const recs = (v: unknown): Rec[] => (Array.isArray(v) ? v.filter((x): x is Rec => !!x && typeof x === "object") : []);

/** Text box that lets people type "99." on the way to "99.50" and only stores valid prices. */
export function PriceInput({ value, disabled, label, onChange, allowBlank = true }: { value: unknown; disabled?: boolean; label: string; allowBlank?: boolean; onChange: (v: number | null) => void }) {
  const shown = typeof value === "number" ? String(value) : "";
  const [text, setText] = useState(shown);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(shown); }, [shown, focused]);
  const parsed = parsePrice(text);
  return (
    <input aria-label={label} inputMode="decimal" value={text} disabled={disabled} placeholder={allowBlank ? "—" : "0"}
      aria-invalid={parsed === undefined || undefined} style={{ width: "100%", minWidth: 70 }}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      onChange={e => {
        setText(e.target.value);
        const p = parsePrice(e.target.value);
        if (p !== undefined && (p !== null || allowBlank)) onChange(p);
      }} />
  );
}

/** Price grid: one row per registration type, one column per price period. Blank = not offered then. */
export function RegistrationPrices({ section, readOnly, change }: { site: EditorSite; section: Section; readOnly: boolean; change: (fn: (s: EditorSite) => EditorSite, key?: string) => void }) {
  const periods = recs(section.data.periods), types = recs(section.data.categories);
  const currency = String(section.data.currency || "USD");
  const setPrice = (row: number, periodId: string, value: number | null) => change(s => {
    const current = types[row].prices;
    const prices = { ...(current && typeof current === "object" && !Array.isArray(current) ? current as Rec : {}), [periodId]: value } as Json;
    return setSectionField(s, section.id, ["categories", row, "prices"], prices);
  }, `${section.id}:price:${row}:${periodId}`);

  return (
    <section className={styles.group}>
      <h3>Prices ({currency})</h3>
      {!periods.length || !types.length ? (
        <p className={styles.hint}>Add at least one price period and one registration type above, then set the prices here.</p>
      ) : (
        <>
          <p className={styles.hint}>Leave a box empty when a type is not offered in that period.</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "4px 6px" }}>Type</th>
                  {periods.map(p => <th key={String(p.id)} style={{ textAlign: "left", padding: "4px 6px", whiteSpace: "nowrap" }}>{String(p.name || "Period")}</th>)}
                </tr>
              </thead>
              <tbody>
                {types.map((type, row) => {
                  const prices = type.prices && typeof type.prices === "object" ? type.prices as Rec : {};
                  return (
                    <tr key={String(type.id ?? row)}>
                      <th scope="row" style={{ textAlign: "left", padding: "4px 6px", fontWeight: 600 }}>{String(type.name || `Type ${row + 1}`)}</th>
                      {periods.map(p => (
                        <td key={String(p.id)} style={{ padding: "3px 4px" }}>
                          <PriceInput value={prices[String(p.id)]} disabled={readOnly} label={`${String(type.name)} price, ${String(p.name)}`}
                            onChange={v => setPrice(row, String(p.id), v)} />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
