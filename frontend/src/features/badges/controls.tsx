"use client";
import type { ReactNode } from "react";
import styles from "./badges.module.css";

/** A row of buttons where exactly one is chosen (replaces a dropdown for short lists). */
export function Segmented<T extends string>({ label, options, value, onChange }: {
  label: string; options: readonly (readonly [T, string])[]; value: T; onChange: (value: T) => void;
}) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel} id={`seg-${label}`}>{label}</span>
      <div className={styles.seg} role="radiogroup" aria-labelledby={`seg-${label}`}>
        {options.map(([id, text]) => (
          <button key={id} type="button" role="radio" aria-checked={value === id} onClick={() => onChange(id)}>{text}</button>
        ))}
      </div>
    </div>
  );
}

/** An on/off button shaped like a chip (replaces a checkbox). */
export function Chip({ on, onChange, children }: { on: boolean; onChange: (on: boolean) => void; children: ReactNode }) {
  return <button type="button" className={styles.chip} aria-pressed={on} onClick={() => onChange(!on)}>{children}</button>;
}

/** A round colour swatch; the native colour picker opens on click. */
export function Swatch({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className={styles.swatch} title={label}>
      <span style={{ background: value }} aria-hidden="true" />
      <input type="color" value={value} onChange={e => onChange(e.target.value)} aria-label={label} />
      <small>{label}</small>
    </label>
  );
}

/** A sidebar section that folds open and closed. */
export function Panel({ title, open = false, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className={styles.card} open={open}>
      <summary>{title}</summary>
      <div className={styles.cardBody}>{children}</div>
    </details>
  );
}
