"use client";
import { useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { setSectionField, type EditorSite } from "./editor-model";
import type { Section } from "./document";
import { uploadImage } from "./media";
import { PriceGrid, PriceInput } from "./registration-prices";
import { currentPeriod, priceIn } from "./registration-pricing";
import styles from "./event-details.module.css";

type Rec = Record<string, unknown>;
type Change = (fn: (site: EditorSite) => EditorSite, coalesceKey?: string) => void;
export type EventDetails = { basics?: Rec; periods?: Rec[]; tickets?: Rec[]; addons?: Rec[]; discounts?: Rec[]; speakers?: Rec[]; deadlines?: Rec[] };
type ListKey = "periods" | "tickets" | "addons" | "discounts" | "speakers" | "deadlines";

/** Pickers in the inspector ask the editor to open Event details on a tab. */
export const OPEN_EVENT = "scistudio:open-event";
export const openEventDetails = (tab = "prices") => window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: tab }));

const uid = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 6)}`;
const recs = (v: unknown): Rec[] => (Array.isArray(v) ? v.filter((x): x is Rec => !!x && typeof x === "object") : []);
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
export const eventOf = (site: EditorSite): EventDetails => (site.event && typeof site.event === "object" ? site.event as EventDetails : {});
const money = (currency: string, n: number) => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n); } catch { return `${currency} ${n}`; } };

export function sampleEvent(name = "Your conference"): EventDetails {
  const year = new Date().getFullYear() + 1;
  return {
    basics: { name, currency: "USD", starts: "", ends: "", venue: "", organiser: "", address: "", tax_id: "", email: "" },
    periods: [{ id: "early", name: "Early bird", ends: `${year}-03-31` }, { id: "standard", name: "Standard", ends: `${year}-05-31` }, { id: "late", name: "Late / onsite", ends: "" }],
    tickets: [["academic", "Academic", "", 699, 799, 899], ["industry", "Industry", "", 799, 899, 999], ["student", "Student", "Valid student ID required", 499, 599, 699], ["virtual", "Virtual", "Online access only", 399, 399, 499]]
      .map(([id, name, description, early, standard, late]) => ({ id, name, description, prices: { early, standard, late } })),
    addons: [{ id: "accommodation", name: "Accommodation (per night)", description: "", price: 190, max: 5 }, { id: "guest", name: "Accompanying person", description: "Social events and lunches", price: 300, max: 5 }],
    discounts: [{ id: "early10", code: "EARLY10", percent: 10, amount: 0, expires: "" }],
    speakers: [], deadlines: [{ id: "abstracts", name: "Abstract submission", date: `${year}-02-28` }],
  };
}

type FieldSpec = { key: string; label: string; kind: "text" | "textarea" | "date" | "money" | "number" | "toggle" | "image"; placeholder?: string; hint?: string; wide?: boolean };

function Input({ spec, value, disabled, siteId, onError, onChange }: { spec: FieldSpec; value: unknown; disabled: boolean; siteId: string; onError: (m: string) => void; onChange: (v: unknown) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (spec.kind === "toggle") return <label className={styles.check}><input type="checkbox" checked={value === true} disabled={disabled} onChange={e => onChange(e.target.checked)} />{spec.label}</label>;
  let control;
  switch (spec.kind) {
    case "textarea": control = <textarea rows={3} value={str(value)} disabled={disabled} placeholder={spec.placeholder} onChange={e => onChange(e.target.value.slice(0, 5000))} />; break;
    case "date": control = <input type="date" value={str(value)} disabled={disabled} onChange={e => onChange(e.target.value)} />; break;
    case "money": control = <PriceInput value={value} label={spec.label} disabled={disabled} allowBlank={false} onChange={v => onChange(v ?? 0)} />; break;
    case "number": control = <input inputMode="numeric" value={str(value)} disabled={disabled} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(Math.max(0, Math.min(100000, Math.round(n)))); }} />; break;
    case "image": control = (
      <div className={styles.photo}>
        {str(value) ? <img src={str(value)} alt="" /> : <span aria-hidden="true" />}
        <button type="button" disabled={disabled || busy} onClick={() => file.current?.click()}>{busy ? "Uploading…" : str(value) ? "Replace" : "Upload photo"}</button>
        {str(value) && <button type="button" disabled={disabled} onClick={() => onChange("")}>Remove</button>}
        <input ref={file} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" onChange={async e => {
          const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
          setBusy(true);
          try { onChange(await uploadImage(siteId, f)); } catch (err) { onError(err instanceof Error ? err.message : "The photo could not be uploaded."); } finally { setBusy(false); }
        }} />
      </div>); break;
    default: control = <input value={str(value)} disabled={disabled} placeholder={spec.placeholder} onChange={e => onChange(e.target.value.slice(0, 300))} />;
  }
  return <label className={styles.field} data-wide={spec.wide || undefined}>{spec.label}{control}{spec.hint && <small>{spec.hint}</small>}</label>;
}

function ItemList({ items, fields, itemLabel, max, newItem, disabled, siteId, onError, onChange }: {
  items: Rec[]; fields: FieldSpec[]; itemLabel: string; max: number; newItem: () => Rec; disabled: boolean; siteId: string;
  onError: (m: string) => void; onChange: (items: Rec[], key?: string) => void;
}) {
  const move = (i: number, d: number) => { const next = [...items]; [next[i], next[i + d]] = [next[i + d], next[i]]; onChange(next); };
  return (
    <>
      <div className={styles.items}>
        {items.map((item, i) => (
          <div key={str(item.id) || i} className={styles.item}>
            <div className={styles.itemHead}>
              <strong>{itemLabel} {i + 1}{str(item.name || item.code) && ` · ${str(item.name || item.code)}`}</strong>
              <div>
                <button type="button" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${itemLabel} ${i + 1} up`}>↑</button>
                <button type="button" disabled={disabled || i === items.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${itemLabel} ${i + 1} down`}>↓</button>
                <button type="button" disabled={disabled} onClick={() => onChange(items.filter((_, j) => j !== i))}>Remove</button>
              </div>
            </div>
            <div className={styles.grid}>
              {fields.map(f => <Input key={f.key} spec={f} value={item[f.key]} disabled={disabled} siteId={siteId} onError={onError}
                onChange={v => onChange(items.map((x, j) => j === i ? { ...x, [f.key]: v } : x), `${str(item.id)}:${f.key}`)} />)}
            </div>
          </div>
        ))}
      </div>
      <button type="button" className={styles.add} disabled={disabled || items.length >= max} onClick={() => onChange([...items, newItem()])}>+ Add {itemLabel.toLowerCase()}</button>
    </>
  );
}

const TABS = [["basics", "Basics"], ["prices", "Dates & prices"], ["addons", "Add-ons"], ["discounts", "Discount codes"], ["speakers", "Speakers"]] as const;

/** One place for the event's facts. Registration forms and speaker sections pick from here. */
export function EventDetailsDialog({ site, initialTab = "basics", readOnly, change, onError, onClose }: {
  site: EditorSite; initialTab?: string; readOnly: boolean; change: Change; onError: (m: string) => void; onClose: () => void;
}) {
  const [tab, setTab] = useState(TABS.some(([t]) => t === initialTab) ? initialTab : "basics");
  const event = eventOf(site), basics = event.basics ?? {}, currency = str(basics.currency) || "USD";
  const update = (patch: EventDetails, key?: string) => change(s => ({ ...s, event: { ...eventOf(s), ...patch } }), key && `event:${key}`);
  const list = (k: ListKey) => recs(event[k]);
  const setList = (k: ListKey) => (items: Rec[], key?: string) => update({ [k]: items }, key && `${k}:${key}`);
  const common = { disabled: readOnly, siteId: site.site_id, onError };
  const tickets = list("tickets"), periods = list("periods");

  return (
    <Modal wide title="Event details" onClose={onClose}>
      <div className={styles.tabs} role="tablist" aria-label="Event details">
        {TABS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {!tickets.length && (
        <div className={styles.start}>
          <p><strong>Start quickly:</strong> fill in sample ticket types, price periods, add-ons and a discount code, then edit them.</p>
          <button type="button" className="primary" disabled={readOnly} onClick={() => update({ ...sampleEvent(site.name), basics: { ...sampleEvent(site.name).basics, ...basics } })}>Use a sample conference</button>
        </div>
      )}

      {tab === "basics" && (
        <div className={styles.block}>
          <p className={styles.intro}>The facts about your event. Receipts and sections use them.</p>
          <div className={styles.grid}>
            {([
              { key: "name", label: "Event name", kind: "text", wide: true }, { key: "starts", label: "First day", kind: "date" }, { key: "ends", label: "Last day", kind: "date" },
              { key: "venue", label: "Venue", kind: "text", placeholder: "Hall, city, country" }, { key: "currency", label: "Currency", kind: "text", placeholder: "USD", hint: "3 letters: USD, EUR, INR, GBP…" },
              { key: "organiser", label: "Organiser", kind: "text" }, { key: "email", label: "Contact email", kind: "text" },
              { key: "address", label: "Organiser address", kind: "textarea", wide: true }, { key: "tax_id", label: "Tax / GST / VAT number", kind: "text", hint: "Shown on receipts." },
            ] as FieldSpec[]).map(f => <Input key={f.key} spec={f} value={basics[f.key]} {...common}
              onChange={v => update({ basics: { ...basics, [f.key]: f.key === "currency" ? str(v).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) : v } }, `basics:${f.key}`)} />)}
          </div>
        </div>
      )}

      {tab === "prices" && <>
        <div className={styles.block}>
          <h3>Price periods</h3>
          <p className={styles.intro}>Prices change automatically on these dates. Leave the last day empty for the final period.</p>
          <ItemList items={periods} itemLabel="Period" max={8} {...common} onChange={setList("periods")}
            fields={[{ key: "name", label: "Name", kind: "text", placeholder: "Early bird" }, { key: "ends", label: "Last day", kind: "date" }]}
            newItem={() => ({ id: uid("per"), name: "New period", ends: "" })} />
        </div>
        <div className={styles.block}>
          <h3>Ticket types</h3>
          <ItemList items={tickets} itemLabel="Ticket" max={30} {...common} onChange={setList("tickets")}
            fields={[{ key: "name", label: "Name", kind: "text" }, { key: "description", label: "Short note", kind: "text", placeholder: "e.g. Valid student ID required" }]}
            newItem={() => ({ id: uid("tkt"), name: "New ticket", description: "", prices: {} })} />
        </div>
        <div className={styles.block}>
          <h3>Prices</h3>
          <p className={styles.intro}>Leave a box empty when a ticket is not sold in that period.</p>
          <PriceGrid periods={periods} tickets={tickets} currency={currency} disabled={readOnly}
            onSet={(row, pid, v) => setList("tickets")(tickets.map((t, i) => i === row ? { ...t, prices: { ...(t.prices as Rec ?? {}), [pid]: v } } : t), `price:${row}:${pid}`)} />
        </div>
        <div className={styles.block}>
          <h3>Other key dates</h3>
          <p className={styles.intro}>Deadlines such as abstract submission or notification of acceptance.</p>
          <ItemList items={list("deadlines")} itemLabel="Date" max={20} {...common} onChange={setList("deadlines")}
            fields={[{ key: "name", label: "Name", kind: "text" }, { key: "date", label: "Date", kind: "date" }]}
            newItem={() => ({ id: uid("dl"), name: "New deadline", date: "" })} />
        </div>
      </>}

      {tab === "addons" && (
        <div className={styles.block}>
          <p className={styles.intro}>Extras people can add to their registration, e.g. accommodation, gala dinner, workshops.</p>
          <ItemList items={list("addons")} itemLabel="Add-on" max={30} {...common} onChange={setList("addons")}
            fields={[{ key: "name", label: "Name", kind: "text" }, { key: "price", label: `Price each (${currency})`, kind: "money" },
              { key: "description", label: "Short note", kind: "text" }, { key: "max", label: "Maximum quantity", kind: "number" }]}
            newItem={() => ({ id: uid("add"), name: "New add-on", description: "", price: 0, max: 1 })} />
        </div>
      )}

      {tab === "discounts" && (
        <div className={styles.block}>
          <p className={styles.intro}>Codes are checked on the server and never shown on your website. A fixed amount is used instead of the % when both are set.</p>
          <ItemList items={list("discounts")} itemLabel="Code" max={100} {...common} onChange={setList("discounts")}
            fields={[{ key: "code", label: "Code", kind: "text", placeholder: "EARLY10" }, { key: "percent", label: "Discount %", kind: "number" },
              { key: "amount", label: `Or fixed amount off (${currency})`, kind: "money" }, { key: "expires", label: "Valid until (optional)", kind: "date" }]}
            newItem={() => ({ id: uid("dsc"), code: "NEWCODE", percent: 10, amount: 0, expires: "" })} />
        </div>
      )}

      {tab === "speakers" && (
        <div className={styles.block}>
          <p className={styles.intro}>Add speakers once; pick them in any Speakers section.</p>
          <ItemList items={list("speakers")} itemLabel="Speaker" max={200} {...common} onChange={setList("speakers")}
            fields={[{ key: "photo", label: "Photo", kind: "image", wide: true }, { key: "name", label: "Name", kind: "text" }, { key: "role", label: "Role / talk", kind: "text" },
              { key: "affiliation", label: "Organization", kind: "text" }, { key: "keynote", label: "Keynote speaker", kind: "toggle" }, { key: "bio", label: "Short bio", kind: "textarea", wide: true }]}
            newItem={() => ({ id: uid("spk"), name: "New speaker", role: "", affiliation: "", photo: "", bio: "", keynote: false })} />
        </div>
      )}
    </Modal>
  );
}

/** Tick boxes: which of the event's items this section uses. No saved list = all. */
function Picker({ section, listKey, items, label, readOnly, change, describe }: {
  section: Section; listKey: string; items: Rec[]; label: string; readOnly: boolean; change: Change; describe: (item: Rec) => string;
}) {
  if (!items.length) return null;
  const saved = section.data[listKey];
  const chosen = Array.isArray(saved) ? saved.map(String) : items.map(i => str(i.id));
  const toggle = (id: string, on: boolean) => {
    const next = on ? items.map(i => str(i.id)).filter(x => x === id || chosen.includes(x)) : chosen.filter(x => x !== id);
    change(s => setSectionField(s, section.id, [listKey], next));
  };
  return (
    <>
      <h4 style={{ margin: "10px 0 0", fontSize: 13 }}>{label}</h4>
      <div className={styles.picker}>
        {items.map(item => (
          <label key={str(item.id)}>
            <span><input type="checkbox" checked={chosen.includes(str(item.id))} disabled={readOnly} onChange={e => toggle(str(item.id), e.target.checked)} />{str(item.name || item.code)}</span>
            <small>{describe(item)}</small>
          </label>
        ))}
      </div>
    </>
  );
}

export function RegistrationPicker({ site, section, readOnly, change }: { site: EditorSite; section: Section; readOnly: boolean; change: Change }) {
  const event = eventOf(site), currency = str(event.basics?.currency) || "USD";
  const period = currentPeriod(event as Rec), pid = str(period?.id);
  const common = { section, readOnly, change };
  return (
    <section style={{ padding: "4px 0 12px" }}>
      <h3 style={{ fontSize: 14, margin: "8px 0 4px" }}>What this form sells</h3>
      {!recs(event.tickets).length ? (
        <p style={{ fontSize: 13, color: "var(--muted, #6b7280)" }}>Add ticket types and prices in Event details first.</p>
      ) : (
        <p style={{ fontSize: 13, color: "var(--muted, #6b7280)", margin: 0 }}>Tick what this form offers. Prices and dates come from Event details{period ? ` (now: ${str(period.name)})` : ""}.</p>
      )}
      <Picker {...common} listKey="ticket_ids" items={recs(event.tickets)} label="Ticket types"
        describe={t => { const p = priceIn(t, pid); return p === null ? "not sold now" : money(currency, p); }} />
      <Picker {...common} listKey="addon_ids" items={recs(event.addons)} label="Add-ons" describe={a => money(currency, Number(a.price) || 0)} />
      <Picker {...common} listKey="discount_ids" items={recs(event.discounts)} label="Discount codes"
        describe={d => (Number(d.amount) ? `${money(currency, Number(d.amount))} off` : `${Number(d.percent) || 0}% off`) + (str(d.expires) ? ` · until ${str(d.expires)}` : "")} />
      <button type="button" disabled={readOnly} onClick={() => openEventDetails("prices")}>Edit Event details</button>
    </section>
  );
}

export function SpeakersPicker({ site, section, readOnly, change }: { site: EditorSite; section: Section; readOnly: boolean; change: Change }) {
  const speakers = recs(eventOf(site).speakers), fromEvent = section.data.source === "event";
  return (
    <section style={{ padding: "4px 0 12px" }}>
      <h3 style={{ fontSize: 14, margin: "8px 0 4px" }}>Speakers</h3>
      <label className={styles.check}>
        <input type="checkbox" checked={fromEvent} disabled={readOnly} onChange={e => change(s => setSectionField(s, section.id, ["source"], e.target.checked ? "event" : "own"))} />
        Use speakers from Event details
      </label>
      {fromEvent && (speakers.length
        ? <Picker section={section} listKey="speaker_ids" items={speakers} label="Show these speakers" readOnly={readOnly} change={change}
            describe={s => [s.keynote === true ? "Keynote" : "", str(s.affiliation)].filter(Boolean).join(" · ")} />
        : <p style={{ fontSize: 13, color: "var(--muted, #6b7280)" }}>No speakers yet. Add them in Event details.</p>)}
      {fromEvent && <button type="button" disabled={readOnly} onClick={() => openEventDetails("speakers")}>Edit speakers</button>}
    </section>
  );
}
