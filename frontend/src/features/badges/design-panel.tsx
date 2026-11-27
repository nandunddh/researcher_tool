"use client";
import { useState, type ChangeEvent } from "react";
import { FONT_STACKS } from "@/features/studio/site-schema";
import { imageProblem, imageTypes, uploadImage } from "@/features/studio/media";
import { ROLES } from "./badges";
import { CHOICES, SIZE_KEYS, SIZE_RANGE, TEMPLATES, moveLine, type BadgeDesign, type Line, type ShowKey } from "./design";
import styles from "./badges.module.css";

const SHOW_LABELS: Record<ShowKey, string> = { title: "Event name", subtitle: "Line under it", logo: "Logo", photo: "Photos", organization: "Organization", detail: "Ticket type or note", role: "Role", qr: "QR code for check-in", sponsors: "Sponsor logos" };
const SIZE_LABELS: Record<(typeof SIZE_KEYS)[number], string> = { title: "Event name", subtitle: "Line under it", name: "Name", organization: "Organization", detail: "Note", role: "Role" };
const LINE_LABELS: Record<Line, string> = { name: "Name", organization: "Organization", detail: "Ticket type or note" };
const COLOR_LABELS: Record<keyof BadgeDesign["colors"], string> = { background: "Background", text: "Name text", muted: "Other text", header: "Header", headerText: "Header text" };
const fontName = (key: string) => key[0].toUpperCase() + key.slice(1);

/** Every part of a badge design, grouped the way people think about it. Changes are applied immediately. */
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

  const choice = <K extends keyof typeof CHOICES>(key: K, label: string) => (
    <label>{label}
      <select value={design[key]} onChange={e => set(key, e.target.value as BadgeDesign[K])}>
        {CHOICES[key].map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </label>
  );

  return (
    <section>
      <h2>Design</h2>
      <div className={styles.row}>
        <span className={styles.hint}>{template ? `Template: ${template.name}` : "Your own design"}</span>
        <button type="button" onClick={onPickTemplate}>Change template</button>
      </div>

      <div className={styles.group}>
        <h3>Texts</h3>
        <label>Event name<input value={design.title} maxLength={80} onChange={e => set("title", e.target.value)} /></label>
        <label>Line under it<input value={design.subtitle} maxLength={120} onChange={e => set("subtitle", e.target.value)} /></label>
        <details>
          <summary className={styles.hint}>Role names printed on badges</summary>
          <div className={styles.pair}>
            {ROLES.map(role => <label key={role}>{role}<input value={design.labels[role]} maxLength={30} onChange={e => set("labels", { ...design.labels, [role]: e.target.value })} /></label>)}
          </div>
        </details>
      </div>

      <div className={styles.group}>
        <h3>Show on the badge</h3>
        <div className={styles.swatches}>
          {(Object.keys(SHOW_LABELS) as ShowKey[]).map(key => (
            <label key={key}><input type="checkbox" checked={design.show[key]} onChange={e => set("show", { ...design.show, [key]: e.target.checked })} />{SHOW_LABELS[key]}</label>
          ))}
        </div>
        {design.show.sponsors && !sponsorCount && <p className={styles.hint}>Add sponsor logos in a Sponsors section of your website; they appear here.</p>}
        <span className={styles.hint}>Order of the lines</span>
        {design.order.map((line, i) => (
          <div key={line} className={styles.orderRow}>
            <span>{LINE_LABELS[line]}</span>
            <button type="button" disabled={i === 0} aria-label={`Move ${LINE_LABELS[line]} up`} onClick={() => set("order", moveLine(design.order, line, -1))}>↑</button>
            <button type="button" disabled={i === design.order.length - 1} aria-label={`Move ${LINE_LABELS[line]} down`} onClick={() => set("order", moveLine(design.order, line, 1))}>↓</button>
          </div>
        ))}
      </div>

      <div className={styles.group}>
        <h3>Layout</h3>
        <div className={styles.pair}>
          {choice("fill", "Badge colour")}
          {choice("header", "Header")}
          {choice("band", "Role")}
          {choice("align", "Alignment")}
          {choice("qr", "QR code position")}
          {choice("photo", "Photo shape")}
        </div>
      </div>

      <div className={styles.group}>
        <h3>Colours</h3>
        <div className={styles.swatches}>
          {(Object.keys(COLOR_LABELS) as (keyof BadgeDesign["colors"])[]).map(key => (
            <label key={key}>
              <input type="color" value={design.colors[key] || design.roleColors.Attendee} onChange={e => set("colors", { ...design.colors, [key]: e.target.value })} />
              {COLOR_LABELS[key]}
            </label>
          ))}
        </div>
        {design.colors.header && <button type="button" className="text-button" onClick={() => set("colors", { ...design.colors, header: "" })}>Header in each person’s role colour</button>}
        <span className={styles.hint}>Role colours</span>
        <div className={styles.swatches}>
          {ROLES.map(role => <label key={role}><input type="color" value={design.roleColors[role]} onChange={e => set("roleColors", { ...design.roleColors, [role]: e.target.value })} />{role}</label>)}
        </div>
      </div>

      <div className={styles.group}>
        <h3>Type</h3>
        <div className={styles.pair}>
          {(["heading", "body"] as const).map(key => (
            <label key={key}>{key === "heading" ? "Headings" : "Other text"}
              <select value={design.fonts[key]} onChange={e => set("fonts", { ...design.fonts, [key]: e.target.value })}>
                {Object.keys(FONT_STACKS).map(font => <option key={font} value={font}>{fontName(font)}</option>)}
              </select>
            </label>
          ))}
        </div>
        {SIZE_KEYS.map(key => (
          <label key={key} className={styles.slider}>{SIZE_LABELS[key]}
            <input type="range" min={SIZE_RANGE.min} max={SIZE_RANGE.max} step={5} value={design.sizes[key]} onChange={e => set("sizes", { ...design.sizes, [key]: e.target.valueAsNumber })} />
            <output>{design.sizes[key]}%</output>
          </label>
        ))}
      </div>

      <div className={styles.group}>
        <h3>Pictures</h3>
        {(["logo", "backgroundImage"] as const).map(key => (
          <div key={key} className={styles.imageRow}>
            <span>{key === "logo" ? "Logo" : "Background picture"}</span>
            {design[key] && <img src={design[key]} alt="" />}
            <label className="button">{uploading === key ? "Uploading…" : design[key] ? "Replace" : "Upload"}
              <input type="file" accept={imageTypes.join(",")} hidden disabled={!!uploading} onChange={e => void upload(key, e)} />
            </label>
            {design[key] && <button type="button" className="text-button" onClick={() => set(key, "")}>Remove</button>}
          </div>
        ))}
        {problem && <p className={styles.note} role="alert">{problem}</p>}
      </div>
    </section>
  );
}
