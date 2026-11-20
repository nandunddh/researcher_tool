"use client";
/** Inspector controls. Every control shows the value actually in use on the page,
 *  even when nothing is set ("Auto" / "Default"), so users always see the real result. */
import { useEffect, useState } from "react";
import type { Gradient } from "./site-schema";
import styles from "./react-editor.module.css";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

// ---------------------------------------------------------------- live values
export type Measured = { fontSize?: number; fontWeight?: number; color?: string; background?: string; width?: number; paddingY?: number; radius?: number };

export function toHex(css: string | undefined): string | undefined {
  if (!css) return undefined;
  if (/^#[0-9a-f]{6}$/i.test(css)) return css.toLowerCase();
  const m = css.match(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?/i);
  if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return undefined;
  return "#" + [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, "0")).join("");
}

/** Reads the computed style of a canvas node after each change, for "Auto"/"Default" read-outs. */
export function useMeasured(selector: string | null, deps: unknown[]): Measured {
  const [m, setM] = useState<Measured>({});
  useEffect(() => {
    if (!selector) return;
    const frame = requestAnimationFrame(() => {
      const node = document.querySelector<HTMLElement>(selector);
      if (!node) { setM({}); return; }
      const cs = getComputedStyle(node);
      const target = node.tagName === "SPAN" && node.querySelector("img") ? node.querySelector("img")! : node;
      setM({
        fontSize: Math.round(parseFloat(cs.fontSize)),
        fontWeight: Number(cs.fontWeight) || undefined,
        color: toHex(cs.color),
        background: toHex(cs.backgroundColor),
        width: Math.round(target.getBoundingClientRect().width / scaleOf(node)),
        paddingY: Math.round(parseFloat(cs.paddingTop)),
        radius: Math.round(parseFloat(cs.borderTopLeftRadius)),
      });
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector, ...deps]);
  return m;
}
/** The canvas page may be zoomed out; convert screen pixels back to page pixels. */
function scaleOf(node: HTMLElement): number {
  const sheet = node.closest<HTMLElement>("[data-scaled]");
  if (!sheet) return 1;
  const r = sheet.getBoundingClientRect();
  return sheet.offsetWidth ? r.width / sheet.offsetWidth : 1;
}

// ---------------------------------------------------------------- numbers
export function NumberField({ label, value, measured, min, max, unit = "px", disabled, onChange }: {
  label: string; value?: number; measured?: number; min: number; max: number; unit?: string; disabled: boolean; onChange: (v: number | null) => void;
}) {
  const shown = value ?? measured ?? min;
  const [draft, setDraft] = useState(String(value ?? ""));
  useEffect(() => setDraft(value === undefined ? "" : String(value)), [value]);
  const commit = () => {
    if (draft.trim() === "") { if (value !== undefined) onChange(null); return; }
    const n = Number(draft);
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n))));
    else setDraft(value === undefined ? "" : String(value));
  };
  return (
    <div className={styles.field}>
      <span>{label}<em>{value === undefined ? `Auto${measured !== undefined ? ` · ${measured}${unit}` : ""}` : `${value}${unit}`}</em></span>
      <div className={styles.rangeRow}>
        <input type="range" aria-label={`${label} slider`} min={min} max={max} value={Math.min(max, Math.max(min, shown))} disabled={disabled}
          onChange={e => onChange(Number(e.target.value))} />
        <span className={styles.unitInput}>
          <input aria-label={`${label} value`} inputMode="numeric" value={draft} disabled={disabled}
            placeholder={measured !== undefined ? String(measured) : "Auto"}
            onChange={e => setDraft(e.target.value.replace(/[^\d]/g, ""))} onBlur={commit}
            onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); onChange(Math.min(max, Math.max(min, shown + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1)))); } }} />
          <i>{unit}</i>
        </span>
        <button type="button" disabled={disabled || value === undefined} onClick={() => onChange(null)} title="Go back to the automatic value">Auto</button>
      </div>
    </div>
  );
}

const weights: [number, string][] = [[300, "Light"], [400, "Regular"], [500, "Medium"], [600, "Semi-bold"], [700, "Bold"], [800, "Extra bold"]];
export function WeightField({ value, measured, disabled, onChange }: { value?: number; measured?: number; disabled: boolean; onChange: (v: number | null) => void }) {
  const current = value ?? measured;
  const [custom, setCustom] = useState("");
  useEffect(() => setCustom(value && !weights.some(([w]) => w === value) ? String(value) : ""), [value]);
  return (
    <div className={styles.field} role="group" aria-label="Text weight">
      <span>Text weight<em>{value === undefined ? `Auto${measured ? ` · ${measured}` : ""}` : value}</em></span>
      <div className={styles.weightGrid}>
        {weights.map(([w, name]) => (
          <button key={w} type="button" aria-pressed={current === w} data-auto={value === undefined || undefined} disabled={disabled}
            onClick={() => onChange(w)} title={`${name} (${w})`}>
            <b style={{ fontWeight: w }}>Aa</b><small>{name}</small>
          </button>
        ))}
      </div>
      <div className={styles.rangeRow}>
        <span className={styles.unitInput}>
          <input aria-label="Custom text weight" inputMode="numeric" placeholder="Custom 100–900" value={custom} disabled={disabled}
            onChange={e => setCustom(e.target.value.replace(/[^\d]/g, ""))}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            onBlur={() => { const n = Math.round(Number(custom) / 100) * 100; if (custom && n >= 100 && n <= 900) onChange(n); }} />
        </span>
        <button type="button" disabled={disabled || value === undefined} onClick={() => onChange(null)}>Auto</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- colours
function ColorInputs({ label, value, shown, disabled, onChange }: { label: string; value?: string; shown?: string; disabled: boolean; onChange: (v: string | null) => void }) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  const swatch = toHex(value) ?? expand(value) ?? shown ?? "#ffffff";
  return (
    <div className={styles.colorRow}>
      <input type="color" aria-label={`${label} picker`} value={swatch} disabled={disabled} onChange={e => onChange(e.target.value)} />
      <input aria-label={`${label} code`} value={draft} spellCheck={false} disabled={disabled}
        placeholder={shown ? `Default · ${shown}` : "Default"}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { const v = draft.trim(); if (v !== (value ?? "")) onChange(v ? (v.startsWith("#") ? v : `#${v}`) : null); }}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
    </div>
  );
}
const expand = (v?: string) => (v && /^#[0-9a-f]{3}$/i.test(v) ? `#${[...v.slice(1)].map(c => c + c).join("")}` : undefined);

/** Solid colour or two-colour gradient, with the colour in use shown when nothing is set. */
export function FillField({ label, color, gradient, shown, allowGradient = true, disabled, onColor, onGradient }: {
  label: string; color?: string; gradient?: Gradient; shown?: string; allowGradient?: boolean; disabled: boolean;
  onColor: (v: string | null) => void; onGradient: (g: Gradient | null) => void;
}) {
  const mode = gradient ? "gradient" : "solid";
  const base = toHex(color) ?? shown ?? "#5a45d6";
  return (
    <div className={styles.field}>
      <span>{label}<em>{gradient ? "Gradient" : color ? color : shown ? `Default · ${shown}` : "Default"}</em></span>
      {allowGradient && (
        <div className={styles.segmented} role="group" aria-label={`${label} type`}>
          <button type="button" aria-pressed={mode === "solid"} disabled={disabled} onClick={() => onGradient(null)}>Solid</button>
          <button type="button" aria-pressed={mode === "gradient"} disabled={disabled}
            onClick={() => { if (!gradient) onGradient({ from: base, to: "#22c3d6", angle: 90 }); }}>Gradient</button>
        </div>
      )}
      {mode === "solid" ? (
        <div className={styles.fillRow}>
          <ColorInputs label={label} value={color} shown={shown} disabled={disabled} onChange={onColor} />
          <button type="button" disabled={disabled || !color} onClick={() => onColor(null)}>Default</button>
        </div>
      ) : gradient && (
        <div className={styles.gradientBox}>
          <span className={styles.gradientPreview} style={{ background: `linear-gradient(${gradient.angle}deg, ${gradient.from}, ${gradient.to})` }} />
          <div className={styles.gradientStops}>
            <label>From<ColorInputs label={`${label} start`} value={gradient.from} disabled={disabled} onChange={v => v && onGradient({ ...gradient, from: v })} /></label>
            <label>To<ColorInputs label={`${label} end`} value={gradient.to} disabled={disabled} onChange={v => v && onGradient({ ...gradient, to: v })} /></label>
          </div>
          <NumberField label="Angle" value={gradient.angle} min={0} max={360} unit="°" disabled={disabled}
            onChange={v => onGradient({ ...gradient, angle: v ?? 90 })} />
        </div>
      )}
    </div>
  );
}

export function Segmented<T extends string>({ label, value, options, disabled, onChange }: {
  label: string; value?: T; options: [T, string][]; disabled: boolean; onChange: (v: T) => void;
}) {
  return (
    <div className={styles.field} role="group" aria-label={label}>
      <span>{label}</span>
      <div className={styles.segmented}>
        {options.map(([v, text]) => <button key={v} type="button" aria-pressed={value === v} disabled={disabled} onClick={() => onChange(v)}>{text}</button>)}
      </div>
    </div>
  );
}
