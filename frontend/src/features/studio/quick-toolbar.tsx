"use client";
/** Floating quick-edit bar above the selected item on the canvas (like Word/Outlook's mini toolbar). */
import { useLayoutEffect, useState, type RefObject } from "react";
import { Icon } from "@/components/icon";
import {
  duplicateSection, findElement, moveSection, removeSection, setElementStyle, setSectionStyle, setTextStyle,
  type EditorSite, type Selection,
} from "./editor-model";
import type { Change, ConfirmRequest } from "./inspector";
import { useMeasured, toHex } from "./inspector-fields";
import { FONT_STACKS, getSectionStyle, getTextStyles, resolveStyle, type Style, type Viewport } from "./site-schema";
import styles from "./react-editor.module.css";

const fontNames: Record<string, string> = { modern: "Modern", classic: "Classic", elegant: "Elegant", friendly: "Friendly", technical: "Technical" };

type Props = {
  site: EditorSite; selection: Selection | null; viewport: Viewport; readOnly: boolean;
  canvas: RefObject<HTMLDivElement | null>; change: Change; ask: (r: ConfirmRequest) => void;
  onSelect: (s: Selection | null) => void; onMore: () => void;
};

export function QuickToolbar({ site, selection, viewport, readOnly, canvas, change, ask, onSelect, onMore }: Props) {
  const { section, element } = findElement(site, selection);
  const textPath = !element && selection?.path ? selection.path : null;
  const selector = element ? `[data-el="${element.id}"]` : section && textPath ? `[data-section="${section.id}"] [data-tp="${textPath}"]` : section ? `[data-section="${section.id}"]` : null;
  const measured = useMeasured(selector, [site, viewport]);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Keep the bar just above the selected item, following scrolling and resizing.
  useLayoutEffect(() => {
    const host = canvas.current;
    if (!host || !selector) { setPos(null); return; }
    const place = () => {
      const node = host.querySelector<HTMLElement>(selector);
      if (!node) { setPos(null); return; }
      const r = node.getBoundingClientRect(), h = host.getBoundingClientRect();
      const top = r.top - h.top + host.scrollTop - 48;
      // Tall item scrolled past its top: keep the bar pinned to the top of the visible canvas.
      setPos({ top: Math.max(host.scrollTop + 8, top), left: Math.max(8, r.left - h.left + host.scrollLeft) });
    };
    place();
    host.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    const observer = new ResizeObserver(place);
    observer.observe(host);
    return () => { host.removeEventListener("scroll", place); window.removeEventListener("resize", place); observer.disconnect(); };
  }, [canvas, selector, site, viewport]);

  if (!section || !pos || readOnly) return null;

  const bar = (children: React.ReactNode) => (
    <div className={styles.quickBar} style={{ top: pos.top, left: pos.left }} role="toolbar" aria-label="Quick edit" onMouseDown={e => e.stopPropagation()}>
      {children}
      <button type="button" onClick={onMore} title="All settings"><Icon name="settings" size={14} /> More</button>
    </div>
  );

  if (element || textPath) {
    const style = element ? resolveStyle(element.style, viewport) : resolveStyle(getTextStyles(section)[textPath!] ?? { desktop: {} }, viewport);
    const set = (patch: Partial<Record<keyof Style, unknown>>) => element
      ? change(s => setElementStyle(s, section.id, element.id, viewport, patch), `${element.id}:quick:${viewport}:${Object.keys(patch).join()}`)
      : change(s => setTextStyle(s, section.id, textPath!, viewport, patch), `${section.id}:${textPath}:quick:${viewport}:${Object.keys(patch).join()}`);
    const kind = element?.kind ?? "text";
    const isImage = !!element && (element.kind === "image" || (element.kind === "logo" && element.mode === "image"));
    if (isImage) {
      const width = style.width ?? measured.width ?? 300, radius = style.radius ?? measured.radius ?? 0;
      return bar(<>
        <Stepper label="Width" value={width} step={20} onChange={v => set({ width: v })} />
        {kind === "image" && <Stepper label="Corners" value={radius} step={4} onChange={v => set({ radius: v })} />}
      </>);
    }
    const size = style.fontSize ?? measured.fontSize ?? 16;
    const bold = (style.fontWeight ?? measured.fontWeight ?? 400) >= 600;
    return bar(<>
      <select aria-label="Font" value={style.fontFamily ?? ""} onChange={e => set({ fontFamily: e.target.value || null })}>
        <option value="">Font</option>
        {Object.keys(FONT_STACKS).map(k => <option key={k} value={k} style={{ fontFamily: FONT_STACKS[k] }}>{fontNames[k]}</option>)}
      </select>
      <Stepper label="Size" value={size} step={2} onChange={v => set({ fontSize: v })} />
      <button type="button" aria-pressed={bold} title="Bold" onClick={() => set({ fontWeight: bold ? 400 : 700 })}><b>B</b></button>
      <button type="button" aria-pressed={!!style.italic} title="Italic" onClick={() => set({ italic: style.italic ? null : true })}><i>I</i></button>
      <button type="button" aria-pressed={!!style.underline} title="Underline" onClick={() => set({ underline: style.underline ? null : true })}><u>U</u></button>
      <Swatch label="Text color" value={style.color ?? measured.color} onChange={v => set({ color: v })} />
      {kind === "button" && <Swatch label="Button color" value={style.background ?? measured.background} onChange={v => set({ background: v, gradient: null })} />}
      {(kind === "heading" || kind === "text") && (["left", "center", "right"] as const).map(a => (
        <button key={a} type="button" aria-pressed={style.textAlign === a} title={`Align ${a}`} onClick={() => set({ textAlign: a })}>{a === "left" ? "⫷" : a === "center" ? "≡" : "⫸"}</button>
      ))}
    </>);
  }

  const sstyle = resolveStyle(getSectionStyle(section), viewport);
  const setS = (patch: Record<string, unknown>) => change(s => setSectionStyle(s, section.id, viewport, patch), `${section.id}:quick:${viewport}:${Object.keys(patch).join()}`);
  const index = site.schema_json.indexOf(section);
  return bar(<>
    <Swatch label="Background" value={sstyle.background ?? measured.background} onChange={v => setS({ background: v, gradient: null })} />
    <Stepper label="Spacing" value={sstyle.paddingY ?? (measured.paddingY || 48)} step={8} onChange={v => setS({ paddingY: v })} />
    <button type="button" title="Move up" disabled={index === 0} onClick={() => change(s => moveSection(s, section.id, -1))}>↑</button>
    <button type="button" title="Move down" disabled={index === site.schema_json.length - 1} onClick={() => change(s => moveSection(s, section.id, 1))}>↓</button>
    <button type="button" title="Duplicate section" onClick={() => change(s => duplicateSection(s, section.id))}>⧉</button>
    <button type="button" title="Delete section" onClick={() => ask({
      title: `Delete “${section.title || section.type}”?`, description: "You can bring it back with Undo until you leave the editor.",
      label: "Delete section", run: () => { change(s => removeSection(s, section.id)); onSelect(null); },
    })}><Icon name="close" size={13} /></button>
  </>);
}

function Stepper({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (v: number) => void }) {
  return (
    <span className={styles.stepper} title={label}>
      <button type="button" aria-label={`${label} smaller`} onClick={() => onChange(Math.max(0, value - step))}>−</button>
      <span aria-label={label}>{value}</span>
      <button type="button" aria-label={`${label} bigger`} onClick={() => onChange(value + step)}>+</button>
    </span>
  );
}

function Swatch({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <label className={styles.swatch} title={label}>
      <input type="color" aria-label={label} value={toHex(value) ?? "#000000"} onChange={e => onChange(e.target.value)} />
    </label>
  );
}
