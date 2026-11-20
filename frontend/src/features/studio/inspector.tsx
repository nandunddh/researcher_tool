"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  addMenuItem, findElement, moveMenuItem, moveSection, removeMenuItem, resetElementStyle, sectionLayouts,
  setElementStyle, setLayout, setSectionStyle, updateElement, updateMenuItem,
  type EditorSite, type Selection,
} from "./editor-model";
import { cleanLink, getElements, getSectionStyle, resolveStyle, type Link, type SiteElement, type Style, type Viewport } from "./site-schema";
import { uploadImage } from "./media";
import styles from "./react-editor.module.css";

export type Change = (fn: (site: EditorSite) => EditorSite, coalesceKey?: string) => void;
type Props = {
  site: EditorSite; selection: Selection | null; viewport: Viewport; readOnly: boolean;
  change: Change; onSelect: (selection: Selection) => void; onError: (message: string) => void;
};

export const elementNames: Record<string, string> = {
  logo: "Logo", menu: "Navigation links", cta: "Button", eyebrow: "Small label", headline: "Headline",
  subheadline: "Description", primary: "Main button", secondary: "Second button", image: "Image",
};
export const elementName = (e: SiteElement) => elementNames[e.role ?? ""] ?? e.kind[0].toUpperCase() + e.kind.slice(1);
const screenNames: Record<Viewport, string> = { desktop: "all screens", tablet: "tablet and mobile", mobile: "mobile only" };

// ---------------------------------------------------------------- small fields
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function ColorField({ label, value, disabled, onChange }: { label: string; value?: string; disabled: boolean; onChange: (v: string | null) => void }) {
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => setDraft(value ?? ""), [value]);
  const swatch = value && value !== "transparent" ? value.slice(0, 7) : "#ffffff";
  return (
    <div className={styles.field}>
      <span>{label}</span>
      <div className={styles.colorRow}>
        <input type="color" aria-label={`${label} picker`} value={swatch.length === 4 ? `#${[...swatch.slice(1)].map(c => c + c).join("")}` : swatch}
          disabled={disabled} onChange={e => onChange(e.target.value)} />
        <input aria-label={`${label} code`} value={draft} placeholder="Default" disabled={disabled} spellCheck={false}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => { if (draft !== (value ?? "")) onChange(draft.trim() ? draft.trim() : null); }}
          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        <button type="button" disabled={disabled || !value} onClick={() => onChange(null)}>Clear</button>
      </div>
    </div>
  );
}

function RangeField({ label, value, min, max, fallback, unit = "px", disabled, onChange }: {
  label: string; value?: number; min: number; max: number; fallback: number; unit?: string; disabled: boolean; onChange: (v: number | null) => void;
}) {
  return (
    <div className={styles.field}>
      <span>{label}<em>{value === undefined ? "Auto" : `${value}${unit}`}</em></span>
      <div className={styles.rangeRow}>
        <input type="range" aria-label={label} min={min} max={max} value={value ?? fallback} disabled={disabled}
          onChange={e => onChange(Number(e.target.value))} />
        <button type="button" disabled={disabled || value === undefined} onClick={() => onChange(null)}>Auto</button>
      </div>
    </div>
  );
}

function Segmented<T extends string>({ label, value, options, disabled, onChange }: {
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

function normalizeUrl(input: string): string {
  const v = input.trim();
  if (!v || /^(https?:|mailto:|tel:|#|\/)/i.test(v)) return v;
  return /^[^\s]+\.[^\s]+$/.test(v) ? `https://${v}` : v;
}

export function LinkChooser({ site, link, disabled, excludeSection, onChange }: {
  site: EditorSite; link?: Link; disabled: boolean; excludeSection?: string; onChange: (link: Link | null) => void;
}) {
  const id = useId();
  const pages = site.pages ?? [];
  const sections = site.schema_json.filter(s => s.id !== excludeSection);
  // "#contact"-style links point at a section; show them that way, not as a website.
  const shownType = link?.type === "url" && link.href.startsWith("#") ? "section" : link?.type ?? "none";
  const [type, setType] = useState<string>(shownType);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState("");
  useEffect(() => {
    setType(shownType);
    setDraft(link?.type === "url" ? link.href : link?.type === "email" ? link.address : link?.type === "phone" ? link.number : "");
    setProblem("");
  }, [link, shownType]);

  function pickType(next: string) {
    setType(next); setProblem("");
    if (next === "none") onChange(null);
    else if (next === "page" && pages[0]) onChange({ type: "page", pageId: pages[0].id });
    else if (next === "section" && sections[0]) onChange({ type: "section", sectionId: sections[0].id });
    else setDraft("");
  }
  function commitDraft() {
    if (!draft.trim()) return;
    const next: Link = type === "email" ? { type: "email", address: draft.trim() }
      : type === "phone" ? { type: "phone", number: draft.trim() }
      : { type: "url", href: normalizeUrl(draft), ...(link?.type === "url" && link.newTab ? { newTab: true } : {}) };
    if (cleanLink(next)) { onChange(next); setProblem(""); }
    else setProblem(type === "email" ? "Enter an email like name@example.com" : type === "phone" ? "Enter a phone number like +1 555 0100" : "Enter a web address like example.com");
  }

  return (
    <div className={styles.linkChooser}>
      <Field label="Link to">
        <select value={type} disabled={disabled} onChange={e => pickType(e.target.value)}>
          <option value="none">Nothing (no link)</option>
          {pages.length > 0 && <option value="page">A page on this website</option>}
          <option value="section">A section on this page</option>
          <option value="url">Another website</option>
          <option value="email">An email address</option>
          <option value="phone">A phone number</option>
        </select>
      </Field>
      {type === "page" && (
        <Field label="Page">
          <select value={link?.type === "page" ? link.pageId : ""} disabled={disabled} onChange={e => onChange({ type: "page", pageId: e.target.value })}>
            {pages.map(p => <option key={p.id} value={p.id}>{p.name || p.slug || "Page"}{p.is_home ? " (home)" : ""}</option>)}
          </select>
        </Field>
      )}
      {type === "section" && (
        sections.length ? (
          <Field label="Section">
            <select value={link?.type === "section" ? link.sectionId : ""} disabled={disabled} onChange={e => onChange({ type: "section", sectionId: e.target.value })}>
              {link?.type !== "section" && (
                <option value="" disabled>
                  {link?.type === "url" && link.href.startsWith("#") ? `Choose a section (“${link.href.slice(1)}” isn’t on this page yet)` : "Choose a section"}
                </option>
              )}
              {sections.map(s => <option key={s.id} value={s.id}>{s.title || s.type}</option>)}
            </select>
          </Field>
        ) : <p className={styles.hint}>Add another section to this page first.</p>
      )}
      {(type === "url" || type === "email" || type === "phone") && (
        <>
          <Field label={type === "url" ? "Web address" : type === "email" ? "Email address" : "Phone number"}>
            <input id={`${id}-draft`} value={draft} disabled={disabled} inputMode={type === "phone" ? "tel" : type === "email" ? "email" : "url"}
              placeholder={type === "url" ? "example.com" : type === "email" ? "name@example.com" : "+1 555 0100"}
              onChange={e => setDraft(e.target.value)} onBlur={commitDraft}
              onKeyDown={e => { if (e.key === "Enter") commitDraft(); }} aria-invalid={!!problem} />
          </Field>
          {problem && <p className={styles.problem} role="alert">{problem}</p>}
          {type === "url" && link?.type === "url" && (
            <label className={styles.check}>
              <input type="checkbox" checked={!!link.newTab} disabled={disabled} onChange={e => onChange({ ...link, newTab: e.target.checked || undefined })} />
              Open in a new tab
            </label>
          )}
        </>
      )}
    </div>
  );
}

function ImageField({ site, value, disabled, onChange, onError }: {
  site: EditorSite; value?: string; disabled: boolean; onChange: (src: string) => void; onError: (m: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState("");
  async function pick(file?: File) {
    if (!file) return;
    setBusy(true);
    try { onChange(await uploadImage(site.site_id, file)); }
    catch (e) { onError(e instanceof Error ? e.message : "The image could not be uploaded."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return (
    <div className={styles.field}>
      <span>Image</span>
      {value ? <img className={styles.thumb} src={value} alt="" /> : <div className={styles.thumbEmpty}>No image yet</div>}
      <div className={styles.buttonRow}>
        <button type="button" disabled={disabled || busy} onClick={() => input.current?.click()}>{busy ? "Uploading…" : value ? "Replace image" : "Upload image"}</button>
        {value && <button type="button" disabled={disabled || busy} onClick={() => onChange("")}>Remove</button>}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={e => void pick(e.target.files?.[0])} />
      <details className={styles.more}>
        <summary>Use an image from the web</summary>
        <div className={styles.rangeRow}>
          <input aria-label="Image web address" value={paste} placeholder="https://…" disabled={disabled} onChange={e => setPaste(e.target.value)} />
          <button type="button" disabled={disabled || !paste.trim()} onClick={() => { onChange(normalizeUrl(paste)); setPaste(""); }}>Use</button>
        </div>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------- panels
function StyleFields({ element, style, viewport, disabled, set, reset }: {
  element: SiteElement; style: Style; viewport: Viewport; disabled: boolean;
  set: (patch: Partial<Record<keyof Style, unknown>>) => void; reset: () => void;
}) {
  const textual = element.kind !== "image" && !(element.kind === "logo" && element.mode === "image");
  return (
    <>
      {textual && <>
        <RangeField label="Text size" value={style.fontSize} min={10} max={element.kind === "heading" ? 120 : 60}
          fallback={element.kind === "heading" ? 48 : 16} disabled={disabled} onChange={v => set({ fontSize: v })} />
        <Field label="Text weight">
          <select value={style.fontWeight ?? ""} disabled={disabled} onChange={e => set({ fontWeight: e.target.value ? Number(e.target.value) : null })}>
            <option value="">Default</option><option value="300">Light</option><option value="400">Regular</option>
            <option value="500">Medium</option><option value="600">Semi-bold</option><option value="700">Bold</option><option value="800">Extra bold</option>
          </select>
        </Field>
        <ColorField label="Text color" value={style.color} disabled={disabled} onChange={v => set({ color: v })} />
      </>}
      {(element.kind === "heading" || element.kind === "text") && (
        <Segmented label="Alignment" value={style.textAlign} disabled={disabled} onChange={v => set({ textAlign: v })}
          options={[["left", "Left"], ["center", "Center"], ["right", "Right"]]} />
      )}
      {element.kind === "button" && <>
        <ColorField label="Button color" value={style.background} disabled={disabled} onChange={v => set({ background: v })} />
        <RangeField label="Corner roundness" value={style.radius} min={0} max={40} fallback={10} disabled={disabled} onChange={v => set({ radius: v })} />
      </>}
      {(element.kind === "image" || (element.kind === "logo" && element.mode === "image")) && <>
        <RangeField label="Width" value={style.width} min={24} max={element.kind === "logo" ? 400 : 1400} fallback={element.kind === "logo" ? 140 : 560}
          disabled={disabled} onChange={v => set({ width: v })} />
        {element.kind === "image" && <RangeField label="Corner roundness" value={style.radius} min={0} max={80} fallback={18} disabled={disabled} onChange={v => set({ radius: v })} />}
      </>}
      {viewport !== "desktop" && (
        <button type="button" className={styles.linkButton} disabled={disabled || !element.style[viewport]} onClick={reset}>
          Use the same style as larger screens
        </button>
      )}
    </>
  );
}

function ElementPanel({ site, sectionId, element, viewport, readOnly, change, onSelect, onError }: Omit<Props, "selection"> & { sectionId: string; element: SiteElement }) {
  const key = (field: string) => `${element.id}:${field}`;
  const edit = (patch: Parameters<typeof updateElement>[3], coalesce?: string) => change(s => updateElement(s, sectionId, element.id, patch), coalesce);
  const style = resolveStyle(element.style, viewport);
  const setStyle = (patch: Partial<Record<keyof Style, unknown>>) =>
    change(s => setElementStyle(s, sectionId, element.id, viewport, patch), key(`style:${viewport}:${Object.keys(patch).join()}`));
  const resetStyle = () => change(s => resetElementStyle(s, sectionId, element.id, viewport));
  return (
    <>
      <button type="button" className={styles.linkButton} onClick={() => onSelect({ sectionId })}>← Back to section</button>
      <h2>{elementName(element)}</h2>
      <section className={styles.group}>
        <h3>Content</h3>
        {element.kind === "logo" && <>
          <Segmented label="Show" value={element.mode ?? "text"} disabled={readOnly} onChange={mode => edit({ mode })}
            options={[["text", "Name"], ["image", "Logo image"]]} />
          {element.mode === "image"
            ? <ImageField site={site} value={element.src} disabled={readOnly} onError={onError} onChange={src => edit({ src })} />
            : <Field label="Brand name"><input value={element.text ?? ""} disabled={readOnly} onChange={e => edit({ text: e.target.value }, key("text"))} /></Field>}
          {element.mode === "image" && <Field label="Brand name" hint="Shown to screen readers and search engines.">
            <input value={element.alt ?? ""} disabled={readOnly} onChange={e => edit({ alt: e.target.value }, key("alt"))} /></Field>}
        </>}
        {(element.kind === "heading" || element.kind === "text") && (
          <Field label="Text"><textarea value={element.text ?? ""} disabled={readOnly} rows={element.kind === "heading" ? 3 : 4}
            onChange={e => edit({ text: e.target.value }, key("text"))} /></Field>
        )}
        {element.kind === "button" && <>
          <Field label="Button text"><input value={element.text ?? ""} disabled={readOnly} placeholder="Leave empty to hide this button"
            onChange={e => edit({ text: e.target.value }, key("text"))} /></Field>
          <LinkChooser site={site} link={element.link} disabled={readOnly} onChange={link => edit({ link })} />
        </>}
        {element.kind === "image" && <>
          <ImageField site={site} value={element.src} disabled={readOnly} onError={onError} onChange={src => edit({ src })} />
          <Field label="Describe this image" hint="Helps people using screen readers, and search engines.">
            <input value={element.alt ?? ""} disabled={readOnly} onChange={e => edit({ alt: e.target.value }, key("alt"))} /></Field>
        </>}
        {element.kind === "menu" && <>
          {(element.items ?? []).map((item, index, all) => (
            <fieldset key={item.id} className={styles.menuItem} disabled={readOnly}>
              <legend>Link {index + 1}</legend>
              <Field label="Text"><input value={item.label} onChange={e => change(s => updateMenuItem(s, sectionId, element.id, item.id, { label: e.target.value }), key(`item:${item.id}`))} /></Field>
              <LinkChooser site={site} link={item.link} disabled={readOnly} excludeSection={sectionId}
                onChange={link => change(s => updateMenuItem(s, sectionId, element.id, item.id, { link }))} />
              <div className={styles.buttonRow}>
                <button type="button" disabled={index === 0} onClick={() => change(s => moveMenuItem(s, sectionId, element.id, item.id, -1))} aria-label={`Move link ${index + 1} up`}>↑</button>
                <button type="button" disabled={index === all.length - 1} onClick={() => change(s => moveMenuItem(s, sectionId, element.id, item.id, 1))} aria-label={`Move link ${index + 1} down`}>↓</button>
                <button type="button" onClick={() => change(s => removeMenuItem(s, sectionId, element.id, item.id))}>Remove</button>
              </div>
            </fieldset>
          ))}
          <button type="button" className={styles.addButton} disabled={readOnly} onClick={() => change(s => addMenuItem(s, sectionId, element.id))}>+ Add link</button>
        </>}
      </section>
      <section className={styles.group}>
        <h3>Style</h3>
        <p className={styles.scope} data-screen={viewport}>Changes apply to {screenNames[viewport]}.</p>
        <StyleFields element={element} style={style} viewport={viewport} disabled={readOnly} set={setStyle} reset={resetStyle} />
      </section>
    </>
  );
}

function SectionPanel({ site, sectionId, viewport, readOnly, change, onSelect }: Omit<Props, "selection" | "onError"> & { sectionId: string }) {
  const section = site.schema_json.find(s => s.id === sectionId)!;
  const layouts = sectionLayouts[section.type];
  const layout = String(section.data.layout_variant || Object.keys(layouts ?? {})[0] || "");
  const elements = getElements(section);
  const style = resolveStyle(getSectionStyle(section), viewport);
  const setStyle = (patch: Record<string, unknown>) => change(s => setSectionStyle(s, sectionId, viewport, patch), `${sectionId}:style:${Object.keys(patch).join()}`);
  const index = site.schema_json.indexOf(section);
  return (
    <>
      <h2>{section.title || section.type}</h2>
      {!elements && <p className={styles.hint}>This section can’t be edited here yet. It keeps its current design when you save.</p>}
      {elements && (
        <section className={styles.group}>
          <h3>Items in this section</h3>
          <p className={styles.hint}>Click an item on the page, or choose it here.</p>
          <div className={styles.itemList}>
            {elements.map(e => <button key={e.id} type="button" onClick={() => onSelect({ sectionId, elementId: e.id })}>{elementName(e)}</button>)}
          </div>
        </section>
      )}
      {layouts && (
        <section className={styles.group}>
          <h3>Layout</h3>
          <Field label="Design">
            <select value={layout} disabled={readOnly} onChange={e => change(s => setLayout(s, sectionId, e.target.value))}>
              {!Object.hasOwn(layouts, layout) && <option value={layout} disabled>Current layout</option>}
              {Object.entries(layouts).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
        </section>
      )}
      {elements && (
        <section className={styles.group}>
          <h3>Background & spacing</h3>
          <p className={styles.scope} data-screen={viewport}>Changes apply to {screenNames[viewport]}.</p>
          <ColorField label="Background color" value={style.background} disabled={readOnly} onChange={v => setStyle({ background: v })} />
          <ColorField label="Text color" value={style.color} disabled={readOnly} onChange={v => setStyle({ color: v })} />
          <RangeField label="Space above and below" value={style.paddingY} min={0} max={240} fallback={section.type === "hero" ? 72 : 20}
            disabled={readOnly} onChange={v => setStyle({ paddingY: v })} />
        </section>
      )}
      <section className={styles.group}>
        <h3>Position on page</h3>
        <div className={styles.buttonRow}>
          <button type="button" disabled={readOnly || index === 0} onClick={() => change(s => moveSection(s, sectionId, -1))}>Move up</button>
          <button type="button" disabled={readOnly || index === site.schema_json.length - 1} onClick={() => change(s => moveSection(s, sectionId, 1))}>Move down</button>
        </div>
      </section>
    </>
  );
}

export function Inspector(props: Props) {
  const { site, selection } = props;
  const { section, element } = findElement(site, selection);
  if (!section) return <><h2>Inspector</h2><p className={styles.hint}>Click anything on the page to change it.</p></>;
  if (element) return <ElementPanel {...props} sectionId={section.id} element={element} />;
  return <SectionPanel {...props} sectionId={section.id} />;
}
