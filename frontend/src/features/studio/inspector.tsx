"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  addMenuItem, findElement, moveMenuItem, moveSection, removeMenuItem, removeSection, resetElementStyle, sectionLayouts,
  setElementStyle, setLayout, setSectionStyle, updateElement, updateMenuItem,
  addListItem, moveListItem, removeListItem, setSectionField, linkContext, type DataPath,
  type EditorSite, type Selection,
} from "./editor-model";
import { cleanLink, getElements, getSectionStyle, hrefToLink, linkHref, resolveStyle, safeImage, type Link, type SiteElement, type Style, type Viewport } from "./site-schema";
import { uploadImage } from "./media";
import type { Section } from "./document";
import { Field, FillField, NumberField, Segmented, WeightField, useMeasured, type Measured } from "./inspector-fields";
import { cleanFieldValue, headerFields, sectionRegistry, type FieldDef } from "./section-registry";
import { hasBlock } from "./section-blocks";
import styles from "./react-editor.module.css";

export type Change = (fn: (site: EditorSite) => EditorSite, coalesceKey?: string) => void;
/** A question shown in the app's own confirmation popup (never the browser's). */
export type ConfirmRequest = { title: string; description: string; label: string; run: () => void };
type Props = {
  site: EditorSite; selection: Selection | null; viewport: Viewport; readOnly: boolean;
  change: Change; onSelect: (selection: Selection) => void; onError: (message: string) => void;
  ask: (request: ConfirmRequest) => void;
};

export const elementNames: Record<string, string> = {
  logo: "Logo", menu: "Navigation links", cta: "Button", eyebrow: "Small label", headline: "Headline",
  subheadline: "Description", primary: "Main button", secondary: "Second button", image: "Image",
};
export const elementName = (e: SiteElement) => elementNames[e.role ?? ""] ?? e.kind[0].toUpperCase() + e.kind.slice(1);
const screenNames: Record<Viewport, string> = { desktop: "all screens", tablet: "tablet and mobile", mobile: "mobile only" };

// ---------------------------------------------------------------- small fields
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
          <>
          <Field label="Section">
            <select value={link?.type === "section" ? link.sectionId : ""} disabled={disabled} onChange={e => onChange({ type: "section", sectionId: e.target.value })}>
              {link?.type !== "section" && <option value="" disabled>Choose a section</option>}
              {sections.map(s => <option key={s.id} value={s.id}>{s.title || s.type}</option>)}
            </select>
          </Field>
          {link?.type === "url" && link.href.startsWith("#") && (
            <p className={styles.hint}>This link points to “{link.href.slice(1)}”, which isn’t on this page yet. Choose a section above.</p>
          )}
          </>
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
function StyleFields({ element, style, viewport, disabled, measured, set, reset }: {
  element: SiteElement; style: Style; viewport: Viewport; disabled: boolean; measured: Measured;
  set: (patch: Partial<Record<keyof Style, unknown>>) => void; reset: () => void;
}) {
  const textual = element.kind !== "image" && !(element.kind === "logo" && element.mode === "image");
  return (
    <>
      {textual && <>
        <NumberField label="Text size" value={style.fontSize} measured={measured.fontSize} min={8} max={160}
          disabled={disabled} onChange={v => set({ fontSize: v })} />
        <WeightField value={style.fontWeight} measured={measured.fontWeight} disabled={disabled} onChange={v => set({ fontWeight: v })} />
        <FillField label="Text color" color={style.color} gradient={element.kind === "button" ? undefined : style.gradient} shown={measured.color}
          allowGradient={element.kind !== "button" && element.kind !== "menu"} disabled={disabled}
          onColor={v => set({ color: v })} onGradient={g => set({ gradient: g })} />
      </>}
      {(element.kind === "heading" || element.kind === "text") && (
        <Segmented label="Alignment" value={style.textAlign} disabled={disabled} onChange={v => set({ textAlign: v })}
          options={[["left", "Left"], ["center", "Center"], ["right", "Right"]]} />
      )}
      {element.kind === "button" && <>
        <FillField label="Button color" color={style.background} gradient={style.gradient} shown={measured.background} disabled={disabled}
          onColor={v => set({ background: v, gradient: null })} onGradient={g => set({ gradient: g, ...(g ? { background: null } : {}) })} />
        <NumberField label="Corner roundness" value={style.radius} measured={measured.radius} min={0} max={60} disabled={disabled} onChange={v => set({ radius: v })} />
      </>}
      {(element.kind === "image" || (element.kind === "logo" && element.mode === "image")) && <>
        <NumberField label="Width" value={style.width} measured={measured.width} min={24} max={element.kind === "logo" ? 400 : 1400}
          disabled={disabled} onChange={v => set({ width: v })} />
        {element.kind === "image" && <NumberField label="Corner roundness" value={style.radius} measured={measured.radius} min={0} max={80} disabled={disabled} onChange={v => set({ radius: v })} />}
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
  const measured = useMeasured(`[data-el="${element.id}"]`, [site, viewport]);
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
        <StyleFields element={element} style={style} viewport={viewport} disabled={readOnly} measured={measured} set={setStyle} reset={resetStyle} />
      </section>
    </>
  );
}

/** One field of a content section, bound to a path inside its data. */
function DataField({ site, section, def, path, readOnly, change, onError }: {
  site: EditorSite; section: Section; def: FieldDef; path: DataPath; readOnly: boolean; change: Change; onError: (m: string) => void;
}) {
  let value: unknown = section.data;
  for (const step of path) value = Array.isArray(value) ? value[step as number] : value && typeof value === "object" ? (value as Record<string, unknown>)[step as string] : undefined;
  const set = (raw: unknown, coalesce = true) => {
    const clean = cleanFieldValue(def.kind, raw, def);
    if (clean === undefined) { onError(def.kind === "image" ? "Use an uploaded image or a link starting with https://" : def.kind === "link" ? "This link is not valid." : "That value can’t be used here."); return; }
    change(s => {
      const target = s.schema_json.find(x => x.id === section.id);
      // Create a missing top-level field (e.g. a new subtitle) before setting it.
      const prepared = target && path.length === 1 && !(String(path[0]) in target.data)
        ? setSectionField({ ...s, schema_json: s.schema_json.map(x => x.id === section.id ? { ...x, data: { ...x.data, [String(path[0])]: "" } } : x) }, section.id, path, clean)
        : setSectionField(s, section.id, path, clean);
      return prepared;
    }, coalesce ? `${section.id}:${path.join(".")}` : undefined);
  };
  const text = typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
  switch (def.kind) {
    case "textarea": return <Field label={def.label} hint={def.hint}><textarea rows={4} value={text} disabled={readOnly} placeholder={def.placeholder} onChange={e => set(e.target.value)} /></Field>;
    case "lines": return <Field label={def.label} hint={def.hint}><textarea rows={4} value={Array.isArray(value) ? value.join("\n") : ""} disabled={readOnly} onChange={e => set(e.target.value)} /></Field>;
    case "select": return (
      <Field label={def.label}>
        <select value={text || def.options?.[0]?.[0]} disabled={readOnly} onChange={e => set(e.target.value, false)}>
          {def.options?.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
    );
    case "toggle": return <label className={styles.check}><input type="checkbox" checked={value === true} disabled={readOnly} onChange={e => set(e.target.checked, false)} />{def.label}</label>;
    case "number": return <Field label={def.label} hint={def.hint}><input inputMode="numeric" value={text} disabled={readOnly} onChange={e => set(e.target.value)} /></Field>;
    case "image": return <ImageField site={site} value={safeImage(value)} disabled={readOnly} onError={onError} onChange={src => set(src, false)} />;
    case "link": {
      const ctx = linkContext(site);
      return (
        <div className={styles.field}>
          <span>{def.label}</span>
          <LinkChooser site={site} link={hrefToLink(value, ctx)} disabled={readOnly} excludeSection={section.id}
            onChange={link => set(link ? linkHref(link, ctx) : "#", false)} />
        </div>
      );
    }
    default: return <Field label={def.label} hint={def.hint}><input value={text} disabled={readOnly} placeholder={def.placeholder} onChange={e => set(e.target.value)} /></Field>;
  }
}

function SectionContent({ site, section, readOnly, change, onError }: { site: EditorSite; section: Section; readOnly: boolean; change: Change; onError: (m: string) => void }) {
  const def = sectionRegistry[section.type];
  if (!def) return null;
  const common = { site, section, readOnly, change, onError };
  return (
    <>
      {(def.header || def.fields.length > 0) && (
        <section className={styles.group}>
          <h3>Content</h3>
          <p className={styles.hint}>Tip: double-click any text on the page to edit it there.</p>
          {def.header && headerFields.map(f => <DataField key={f.key} {...common} def={f} path={[f.key]} />)}
          {def.fields.map(f => <DataField key={f.key} {...common} def={f} path={[f.key]} />)}
        </section>
      )}
      {def.lists.map(listDef => {
        const items = Array.isArray(section.data[listDef.key]) ? (section.data[listDef.key] as unknown[]) : [];
        return (
          <section key={listDef.key} className={styles.group}>
            <h3>{listDef.label} ({items.length})</h3>
            {items.map((_, index) => (
              <details key={index} className={styles.menuItem} open={items.length <= 3}>
                <summary>{listDef.itemLabel} {index + 1}{itemTitle(items[index]) && <span> · {itemTitle(items[index])}</span>}</summary>
                {listDef.fields.map(f => <DataField key={f.key} {...common} def={f} path={[listDef.key, index, f.key]} />)}
                <div className={styles.buttonRow}>
                  <button type="button" disabled={readOnly || index === 0} onClick={() => change(s => moveListItem(s, section.id, listDef.key, index, -1))} aria-label={`Move ${listDef.itemLabel} ${index + 1} up`}>↑</button>
                  <button type="button" disabled={readOnly || index === items.length - 1} onClick={() => change(s => moveListItem(s, section.id, listDef.key, index, 1))} aria-label={`Move ${listDef.itemLabel} ${index + 1} down`}>↓</button>
                  <button type="button" disabled={readOnly} onClick={() => change(s => removeListItem(s, section.id, listDef.key, index))}>Remove</button>
                </div>
              </details>
            ))}
            <button type="button" className={styles.addButton} disabled={readOnly || items.length >= listDef.max}
              onClick={() => change(s => addListItem(s, section.id, listDef.key, listDef.newItem(), listDef.max))}>+ Add {listDef.itemLabel.toLowerCase()}</button>
          </section>
        );
      })}
    </>
  );
}
const itemTitle = (item: unknown) => {
  if (!item || typeof item !== "object") return "";
  const r = item as Record<string, unknown>;
  const t = [r.title, r.name, r.q, r.label, r.caption, r.text].find(v => typeof v === "string" && v.trim());
  return typeof t === "string" ? (t.length > 28 ? `${t.slice(0, 28)}…` : t) : "";
};

function SectionPanel({ site, sectionId, viewport, readOnly, change, onSelect, onError, ask }: Omit<Props, "selection"> & { sectionId: string }) {
  const section = site.schema_json.find(s => s.id === sectionId)!;
  const layouts = sectionLayouts[section.type];
  const layout = String(section.data.layout_variant || Object.keys(layouts ?? {})[0] || "");
  const elements = getElements(section);
  const editable = !!elements || hasBlock(section.type);
  const style = resolveStyle(getSectionStyle(section), viewport);
  const measured = useMeasured(`[data-section="${sectionId}"]`, [site, viewport]);
  const setStyle = (patch: Record<string, unknown>) => change(s => setSectionStyle(s, sectionId, viewport, patch), `${sectionId}:style:${viewport}:${Object.keys(patch).join()}`);
  const index = site.schema_json.indexOf(section);
  return (
    <>
      <h2>{section.title || sectionRegistry[section.type]?.name || section.type}</h2>
      {!editable && <p className={styles.hint}>Editing this section’s content is coming soon. It keeps its current design when you save.</p>}
      {elements && (
        <section className={styles.group}>
          <h3>Items in this section</h3>
          <p className={styles.hint}>Click an item on the page, or choose it here.</p>
          <div className={styles.itemList}>
            {elements.map(e => <button key={e.id} type="button" onClick={() => onSelect({ sectionId, elementId: e.id })}>{elementName(e)}</button>)}
          </div>
        </section>
      )}
      {!elements && <SectionContent site={site} section={section} readOnly={readOnly} change={change} onError={onError} />}
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
      {editable && (
        <section className={styles.group}>
          <h3>Background & spacing</h3>
          <p className={styles.scope} data-screen={viewport}>Changes apply to {screenNames[viewport]}.</p>
          <FillField label="Background" color={style.background} gradient={style.gradient} shown={measured.background} disabled={readOnly}
            onColor={v => setStyle({ background: v, gradient: null })} onGradient={g => setStyle({ gradient: g })} />
          <FillField label="Text color" color={style.color} shown={measured.color} allowGradient={false} disabled={readOnly}
            onColor={v => setStyle({ color: v })} onGradient={() => undefined} />
          <NumberField label="Space above and below" value={style.paddingY} measured={measured.paddingY} min={0} max={240}
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
      <section className={styles.group}>
        <button type="button" className={styles.danger} disabled={readOnly}
          onClick={() => ask({
            title: `Delete “${section.title || section.type}”?`,
            description: "This removes the section from your page. You can bring it back with Undo until you leave the editor.",
            label: "Delete section",
            run: () => { change(s => removeSection(s, sectionId)); onSelect({ sectionId: "" }); },
          })}>
          Delete section
        </button>
        <p className={styles.hint}>You can bring it back with Undo (Ctrl+Z).</p>
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
