"use client";
import { useState, type ChangeEvent } from "react";
import { FONT_STACKS } from "@/features/studio/site-schema";
import { imageProblem, imageTypes, uploadImage } from "@/features/studio/media";
import { ROLES } from "./badges";
import { CHOICES, SIZE_KEYS, SIZE_RANGE, TEMPLATES, moveLine, type BadgeDesign, type Line, type ShowKey } from "./design";
import { Chip, Panel, Segmented, Swatch } from "./controls";
import styles from "./badges.module.css";

const SHOW_LABELS: Record<ShowKey, string> = { title: "Event name", subtitle: "Date line", logo: "Logo", photo: "Photos", organization: "Organization", detail: "Ticket type", role: "Role", qr: "QR code", sponsors: "Sponsor logos" };
const SIZE_LABELS: Record<(typeof SIZE_KEYS)[number], string> = { title: "Event name", subtitle: "Date line", name: "Name", organization: "Organization", detail: "Ticket type", role: "Role" };
const LINE_LABELS: Record<Line, string> = { name: "Name", organization: "Organization", detail: "Ticket type" };
const COLOR_LABELS: Record<keyof BadgeDesign["colors"], string> = { background: "Background", text: "Name", muted: "Other text", header: "Header", headerText: "Header text" };
const fontName = (key: string) => key[0].toUpperCase() + key.slice(1);

/** Every part of a badge design, in folding sections. Changes apply immediately to all badges. */
export function DesignPanel({ design, siteId, sponsorCount, onChange, onPickTemplate }: {
  design: BadgeDesign; siteId: string; sponsorCount: number; onChange: (next: BadgeDesign) => void; onPickTemplate: () => void;
}) {
  const [uploading, setUploading] = useState("");
  const [problem, setProblem] = useState("");
  const set = <K extends keyof BadgeDesign>(key: K, value: BadgeDesign[K]) => onChange({ ...design, [key]: value, template: key === "title" || key === "subtitle" ? design.template : "custom" });
  const template = TEMPLATES.find(t => t.id === design.template);

  async function upload(key: "logo" | "backgroundImage", e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const bad = imageProblem(file);
    if (bad) { setProblem(bad); return; }
    setUploading(key); setProblem("");
    try { set(key, await uploadImage(siteId, file)); }
    catch (err) { setProblem(err instanceof Error ? err.message : "The image could not be uploaded."); }
    finally { setUploading(""); }
  }

  return (
    <>
      <div className={styles.templateBar}>
        <span><small>Template</small><strong>{template ? template.name : "Your own design"}</strong></span>
        <button type="button" onClick={onPickTemplate}>Change</button>
      </div>

      <Panel title="Texts" open>
        <label className={styles.field}><span className={styles.fieldLabel}>Event name</span><input value={design.title} maxLength={80} onChange={e => set("title", e.target.value)} /></label>
        <label className={styles.field}><span className={styles.fieldLabel}>Date line</span><input value={design.subtitle} maxLength={120} onChange={e => set("subtitle", e.target.value)} /></label>
      </Panel>

      <Panel title="What shows" open>
        <div className={styles.chips}>
          {(Object.keys(SHOW_LABELS) as ShowKey[]).map(key => (
            <Chip key={key} on={design.show[key]} onChange={on => set("show", { ...design.show, [key]: on })}>{SHOW_LABELS[key]}</Chip>
          ))}
        </div>
        {design.show.sponsors && !sponsorCount && <p className={styles.hint}>Add sponsor logos in a Sponsors section of your website; they appear here.</p>}
        <span className={styles.fieldLabel}>Order of the lines</span>
        <ol className={styles.order}>
          {design.order.map((line, i) => (
            <li key={line}>
              <span>{LINE_LABELS[line]}</span>
              <button type="button" disabled={i === 0} aria-label={`Move ${LINE_LABELS[line]} up`} onClick={() => set("order", moveLine(design.order, line, -1))}>↑</button>
              <button type="button" disabled={i === design.order.length - 1} aria-label={`Move ${LINE_LABELS[line]} down`} onClick={() => set("order", moveLine(design.order, line, 1))}>↓</button>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title="Layout">
        <Segmented label="Badge colour" options={CHOICES.fill} value={design.fill} onChange={v => set("fill", v)} />
        <Segmented label="Header" options={CHOICES.header} value={design.header} onChange={v => set("header", v)} />
        <Segmented label="Role" options={CHOICES.band} value={design.band} onChange={v => set("band", v)} />
        <Segmented label="Alignment" options={CHOICES.align} value={design.align} onChange={v => set("align", v)} />
        <Segmented label="QR code" options={CHOICES.qr} value={design.qr} onChange={v => set("qr", v)} />
        <Segmented label="Photo" options={CHOICES.photo} value={design.photo} onChange={v => set("photo", v)} />
      </Panel>

      <Panel title="Colours">
        <div className={styles.swatches}>
          {(Object.keys(COLOR_LABELS) as (keyof BadgeDesign["colors"])[]).map(key => (
            <Swatch key={key} label={COLOR_LABELS[key]} value={design.colors[key] || design.roleColors.Attendee} onChange={v => set("colors", { ...design.colors, [key]: v })} />
          ))}
        </div>
        {design.colors.header && <button type="button" className="text-button" onClick={() => set("colors", { ...design.colors, header: "" })}>Header in each person’s role colour</button>}
        <span className={styles.fieldLabel}>Role colours</span>
        <div className={styles.swatches}>
          {ROLES.map(role => <Swatch key={role} label={role} value={design.roleColors[role]} onChange={v => set("roleColors", { ...design.roleColors, [role]: v })} />)}
        </div>
      </Panel>

      <Panel title="Type">
        {(["heading", "body"] as const).map(key => (
          <div key={key} className={styles.field}>
            <span className={styles.fieldLabel}>{key === "heading" ? "Headings" : "Other text"}</span>
            <div className={styles.fonts} role="radiogroup" aria-label={key === "heading" ? "Heading font" : "Text font"}>
              {Object.entries(FONT_STACKS).map(([font, stack]) => (
                <button key={font} type="button" role="radio" aria-checked={design.fonts[key] === font} onClick={() => set("fonts", { ...design.fonts, [key]: font })}>
                  <span style={{ fontFamily: stack }}>Aa</span><small>{fontName(font)}</small>
                </button>
              ))}
            </div>
          </div>
        ))}
        {SIZE_KEYS.map(key => (
          <label key={key} className={styles.slider}><span>{SIZE_LABELS[key]}</span>
            <input type="range" min={SIZE_RANGE.min} max={SIZE_RANGE.max} step={5} value={design.sizes[key]} onChange={e => set("sizes", { ...design.sizes, [key]: e.target.valueAsNumber })} />
            <output>{design.sizes[key]}%</output>
          </label>
        ))}
      </Panel>

      <Panel title="Logo and pictures">
        {(["logo", "backgroundImage"] as const).map(key => (
          <div key={key} className={styles.imageRow}>
            <div className={styles.imageBox}>{design[key] ? <img src={design[key]} alt="" /> : <span>{key === "logo" ? "Logo" : "Background"}</span>}</div>
            <label className="button">{uploading === key ? "Uploading…" : design[key] ? "Replace" : "Upload"}
              <input type="file" accept={imageTypes.join(",")} hidden disabled={!!uploading} onChange={e => void upload(key, e)} />
            </label>
            {design[key] && <button type="button" className="text-button" onClick={() => set(key, "")}>Remove</button>}
          </div>
        ))}
        {problem && <p className={styles.note} role="alert">{problem}</p>}
      </Panel>

      <Panel title="Role names on badges">
        <div className={styles.pair}>
          {ROLES.map(role => <label key={role} className={styles.field}><span className={styles.fieldLabel}>{role}</span><input value={design.labels[role]} maxLength={30} onChange={e => set("labels", { ...design.labels, [role]: e.target.value })} /></label>)}
        </div>
      </Panel>
    </>
  );
}
