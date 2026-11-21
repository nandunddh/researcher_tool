"use client";
/**
 * React versions of every content section, drawn from the section's real `data`.
 * Used by the editor canvas, the preview page and (later) the published site.
 */
import { paletteMime, reorderMime } from "./form-palette";
import { currentPeriod, keyDates, priceIn, registrationData } from "./registration-pricing";
import { useState, type ReactNode } from "react";
import type { Json, Section } from "./document";
import { linkHref, safeImage, type LinkContext } from "./site-schema";
import { EditableText } from "./editable-text";
import type { EditHooks } from "./site-renderer";
import { Icon } from "@/components/icon";
import styles from "./section-blocks.module.css";

type Rec = Record<string, Json>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const list = (v: unknown): Rec[] => (Array.isArray(v) ? v.filter(isRec) : []);
type Path = (string | number)[];

type Ctx = { section: Section; edit?: EditHooks; ctx: LinkContext };

/** Text bound to a path in the section data: plain text for visitors, double-click to edit in the editor. */
function T({ c, path, tag = "span", className, placeholder, multiline }: {
  c: Ctx; path: Path; tag?: string; className?: string; placeholder: string; multiline?: boolean;
}) {
  let value: unknown = c.section.data;
  for (const step of path) value = Array.isArray(value) ? value[step as number] : isRec(value) ? value[step as string] : undefined;
  const text = str(value);
  if (!text && !c.edit) return null;
  const tp = path.join(".");
  const selectable = c.edit ? {
    "data-editable": true,
    "data-selected": (c.edit.selection?.sectionId === c.section.id && c.edit.selection.path === tp) || undefined,
    onClick: (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); c.edit?.onSelect({ sectionId: c.section.id, path: tp }); },
  } : {};
  return (
    <EditableText key={`${tp}:${text}`} tag={tag} className={className} value={text} edit={c.edit}
      placeholder={placeholder} multiline={multiline} data-tp={tp} {...selectable}
      onCommit={next => c.edit?.onField?.(c.section.id, path, next)} />
  );
}

function href(c: Ctx, value: unknown) {
  return c.edit ? undefined : linkHref({ type: "url", href: str(value) }, c.ctx);
}

function Header({ c, center = true }: { c: Ctx; center?: boolean }) {
  const d = c.section.data;
  if (!c.edit && !str(d.section_tag) && !str(d.section_title) && !str(d.section_subtitle)) return null;
  return (
    <header className={styles.header} data-center={center || undefined}>
      <T c={c} path={["section_tag"]} tag="small" className={styles.tag} placeholder="small label" />
      <T c={c} path={["section_title"]} tag="h2" className={styles.title} placeholder="section title" />
      <T c={c} path={["section_subtitle"]} tag="p" className={styles.subtitle} placeholder="subtitle" multiline />
    </header>
  );
}

/** Placeholder kept at full size in the editor, preview and live site until an image is added. */
function EmptyImage({ edit }: { edit?: unknown }) {
  return <div className={styles.photoEmpty} data-public={edit ? undefined : true} aria-hidden={edit ? undefined : true}>{edit ? "Add an image" : <Icon name="layers" size={32} />}</div>;
}

function Img({ src, alt, className }: { src: unknown; alt: string; className?: string }) {
  const safe = safeImage(src);
  return safe ? <img className={className} src={safe} alt={alt} loading="lazy" /> : null;
}

function Features({ c }: { c: Ctx }) {
  const items = list(c.section.data.items);
  return (
    <div className={styles.wrap}>
      <Header c={c} />
      <div className={styles.grid}>
        {items.map((item, i) => (
          <article key={i} className={styles.card}>
            <span className={styles.iconBadge} aria-hidden="true"><Icon name="bolt" size={20} /></span>
            <T c={c} path={["items", i, "title"]} tag="h3" placeholder="title" />
            <T c={c} path={["items", i, "description"]} tag="p" className={styles.muted} placeholder="description" multiline />
          </article>
        ))}
      </div>
    </div>
  );
}

function Speakers({ c: own }: { c: Ctx }) {
  // "From Event details": speakers are edited there, so the cards here are read-only.
  const fromEvent = own.section.data.source === "event";
  const chosen = own.section.data.speaker_ids;
  const people = fromEvent
    ? list(own.ctx.event?.speakers).filter(p => !Array.isArray(chosen) || chosen.includes(p.id))
    : list(own.section.data.speakers);
  const c = fromEvent ? { ...own, edit: undefined } : own;
  return (
    <div className={styles.wrap}>
      <Header c={c} />
      <div className={styles.grid}>
        {people.map((p, i) => (
          <article key={i} className={`${styles.card} ${styles.person}`}>
            {safeImage(p.photo) ? <Img className={styles.portrait} src={p.photo} alt={str(p.name)} />
              : <span className={styles.avatar} aria-hidden="true"><Icon name="user" size={34} /></span>}
            <T c={c} path={["speakers", i, "name"]} tag="h3" placeholder="name" />
            <T c={c} path={["speakers", i, "role"]} tag="p" className={styles.accentText} placeholder="role" />
            <T c={c} path={["speakers", i, "affiliation"]} tag="p" className={styles.muted} placeholder="organization" />
            <T c={c} path={["speakers", i, "bio"]} tag="p" className={styles.small} placeholder="short bio" multiline />
          </article>
        ))}
      </div>
    </div>
  );
}

function Pricing({ c }: { c: Ctx }) {
  const tiers = list(c.section.data.tiers);
  return (
    <div className={styles.wrap}>
      <Header c={c} />
      <div className={styles.grid}>
        {tiers.map((tier, i) => (
          <article key={i} className={`${styles.card} ${styles.tier}`} data-featured={tier.featured === true || undefined}>
            {str(tier.badge) && <span className={styles.badge}>{str(tier.badge)}</span>}
            <T c={c} path={["tiers", i, "name"]} tag="h3" placeholder="pass name" />
            <p className={styles.price}>
              <T c={c} path={["tiers", i, "price"]} tag="strong" placeholder="price" />
              <T c={c} path={["tiers", i, "period"]} tag="span" className={styles.muted} placeholder="billing" />
            </p>
            <T c={c} path={["tiers", i, "description"]} tag="p" className={styles.muted} placeholder="who it is for" multiline />
            <ul className={styles.checks}>
              {(Array.isArray(tier.features) ? tier.features : []).map((f, j) => <li key={j}><Icon name="check" size={14} />{str(f)}</li>)}
            </ul>
            {(str(tier.btn_label) || c.edit) && (
              <a className={styles.button} data-primary={tier.featured === true || undefined} href={href(c, tier.btn_url)}>
                <T c={c} path={["tiers", i, "btn_label"]} placeholder="button text" />
              </a>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function Gallery({ c }: { c: Ctx }) {
  const images = list(c.section.data.images);
  return (
    <div className={styles.wrap}>
      <Header c={c} />
      <div className={styles.grid}>
        {images.map((img, i) => (
          <figure key={i} className={styles.photo}>
            {safeImage(img.url) ? <Img src={img.url} alt={str(img.caption)} /> : <EmptyImage edit={c.edit} />}
            <T c={c} path={["images", i, "caption"]} tag="figcaption" placeholder="caption" />
          </figure>
        ))}
      </div>
    </div>
  );
}

function Faq({ c }: { c: Ctx }) {
  const faqs = list(c.section.data.faqs);
  return (
    <div className={`${styles.wrap} ${styles.narrow}`}>
      <Header c={c} />
      <div className={styles.faq}>
        {faqs.map((f, i) => (
          <details key={i} open={!!c.edit || undefined}>
            <summary><T c={c} path={["faqs", i, "q"]} placeholder="question" /></summary>
            <T c={c} path={["faqs", i, "a"]} tag="p" className={styles.muted} placeholder="answer" multiline />
          </details>
        ))}
      </div>
    </div>
  );
}

/** Fields a form shows; must match backend/forms.py DEFAULT_CONTACT_FIELDS. */
export const defaultContactFields: Rec[] = [
  { id: "name", label: "Name", type: "text", required: true },
  { id: "email", label: "Email", type: "email", required: true },
  { id: "message", label: "Message", type: "textarea", required: true },
];
export const defaultRegistrationFields: Rec[] = [
  { id: "name", label: "Full name", type: "text", required: true },
  { id: "email", label: "Email", type: "email", required: true },
  { id: "organization", label: "Organization", type: "text", required: true },
  { id: "phone", label: "Phone", type: "phone", required: false },
  { id: "country", label: "Country", type: "text", required: true },
];
const autoComplete: Record<string, string> = { email: "email", phone: "tel", name: "name" };

/** Renders a form from its field list and sends it to the backend (saved in the database). */
function WebsiteForm({ c, children, inline, top, extra, onResult }: {
  c: Ctx; children: ReactNode; inline?: boolean; top?: ReactNode;
  /** Extra values sent with the fields (registration: type, add-ons, discount). */
  extra?: () => Record<string, unknown>;
  /** Return true to take over after a successful send (registration shows payment). */
  onResult?: (body: Record<string, unknown>) => boolean;
}) {
  const d = c.section.data;
  const fields = list(d.form_fields).length ? list(d.form_fields) : c.section.type === "registration" ? defaultRegistrationFields : defaultContactFields;
  const [state, setState] = useState<{ kind: "idle" | "sending" | "sent" | "error"; message?: string }>({ kind: "idle" });
  const editable = !!c.edit?.onFormFields && !c.edit.readOnly;
  const orderType = reorderMime + "-" + c.section.id.toLowerCase();
  function accept(e: React.DragEvent, index?: number) {
    if (!editable || !(e.dataTransfer.types.includes(paletteMime) || (index !== undefined && e.dataTransfer.types.includes(orderType)))) return false;
    e.preventDefault();
    e.stopPropagation();
    return true;
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (c.edit) return;
    const form = new FormData(e.currentTarget);
    const values: Record<string, unknown> = { _hp: form.get("_hp") ?? "", ...(extra?.() ?? {}) };
    for (const f of fields) values[str(f.id)] = f.type === "checkbox" ? form.get(str(f.id)) === "on" : str(form.get(str(f.id)));
    if (!c.ctx.siteId) { setState({ kind: "error", message: "This form can be sent from the preview or the live site." }); return; }
    setState({ kind: "sending" });
    try {
      const res = await fetch(`/api/public/forms/${encodeURIComponent(c.ctx.siteId)}/${encodeURIComponent(c.section.id)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(typeof body?.detail === "string" ? body.detail : "Your message could not be sent. Please try again.");
      if (onResult?.(body)) { setState({ kind: "idle" }); return; }
      setState({ kind: "sent", message: body?.message ?? "Thank you! Your message has been sent." });
      (e.target as HTMLFormElement).reset();
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Your message could not be sent." });
    }
  }
  return (
    <form className={`${styles.form} ${inline ? styles.formInline : ""}`} onDragOver={e => accept(e)} onDrop={e => {
      if (accept(e)) c.edit?.onFormFields?.(c.section.id, e.dataTransfer.getData(paletteMime));
    }} onSubmit={submit} noValidate={!!c.edit}>
      {top}
      {fields.map((f, index) => {
        const dragProps = editable ? {
          draggable: true, title: "Drag to reorder this field",
          onDragStart: (e: React.DragEvent) => { e.stopPropagation(); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData(orderType, String(index)); },
          onDragOver: (e: React.DragEvent) => accept(e, index),
          onDrop: (e: React.DragEvent) => {
            if (!accept(e, index)) return;
            const type = e.dataTransfer.getData(paletteMime);
            c.edit?.onFormFields?.(c.section.id, type || { from: Number(e.dataTransfer.getData(orderType)), to: index });
          },
        } : {};
        const id = str(f.id), label = str(f.label) || id, required = f.required === true, disabled = !!c.edit;
        const mark = required ? " *" : "";
        if (f.type === "textarea") return <label key={`${index}:${id}`} {...dragProps}>{label}{mark}<textarea name={id} rows={4} required={required} disabled={disabled} /></label>;
        if (f.type === "checkbox") return <label key={`${index}:${id}`} {...dragProps} className={styles.checkRow}><input type="checkbox" name={id} required={required} disabled={disabled} />{label}{mark}</label>;
        if (f.type === "select") return (
          <label key={`${index}:${id}`} {...dragProps}>{label}{mark}<select name={id} required={required} disabled={disabled} defaultValue="">
            <option value="" disabled>Choose…</option>
            {(Array.isArray(f.options) ? f.options : []).map((o, i) => <option key={i} value={str(o)}>{str(o)}</option>)}
          </select></label>
        );
        return <label key={`${index}:${id}`} {...dragProps}>{label}{mark}<input name={id} type={f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text"}
          autoComplete={autoComplete[str(f.type)] ?? autoComplete[id]} required={required} disabled={disabled} /></label>;
      })}
      {/* spam trap: hidden from people, bots fill it */}
      {/* readOnly: browser autofill skips it (it ignores autoComplete="off"); bots posting raw data still fill it */}
      <input name="_hp" tabIndex={-1} autoComplete="off" readOnly aria-hidden="true" className={styles.trap} />
      <button type="submit" className={styles.button} data-primary disabled={state.kind === "sending"}>{state.kind === "sending" ? "Sending…" : children}</button>
      {state.kind === "sent" && <p role="status" className={styles.formSuccess}>{state.message}</p>}
      {state.kind === "error" && <p role="alert" className={styles.formError}>{state.message}</p>}
    </form>
  );
}

function Contact({ c }: { c: Ctx }) {
  const d = c.section.data;
  const addressKey = str(d.address) || !str(d.location) ? "address" : "location";
  const buttonKey = str(d.btn_text) || !str(d.form_button_label) ? "btn_text" : "form_button_label";
  const layout = ["split", "centered", "inline", "image", "dark"].includes(str(d.form_layout)) ? str(d.form_layout) : "split";
  const details = (
    <ul className={styles.contactList} data-row={layout === "centered" || layout === "inline" || undefined}>
      {(str(d.email) || c.edit) && <li><Icon name="doc" size={16} /><T c={c} path={["email"]} placeholder="email address" /></li>}
      {(str(d.phone) || c.edit) && <li><Icon name="mobile" size={16} /><T c={c} path={["phone"]} placeholder="phone number" /></li>}
      {(str(d[addressKey]) || c.edit) && <li><Icon name="grid" size={16} /><T c={c} path={[addressKey]} placeholder="address" /></li>}
    </ul>
  );
  const form = (
    <WebsiteForm c={c} inline={layout === "inline"}>
      <T c={c} path={[buttonKey]} placeholder="button text" />
      {!str(d[buttonKey]) && !c.edit && "Send message"}
    </WebsiteForm>
  );
  if (layout === "centered" || layout === "inline") return (
    <div className={`${styles.wrap} ${styles.narrow}`} data-layout={layout}>
      <Header c={c} />
      {form}
      {details}
    </div>
  );
  if (layout === "image") return (
    <div className={`${styles.wrap} ${styles.split}`}>
      {safeImage(d.image) ? <Img className={styles.formImage} src={d.image} alt={str(d.section_title)} />
        : <EmptyImage edit={c.edit} />}
      <div><Header c={c} center={false} />{form}{details}</div>
    </div>
  );
  return (
    <div className={layout === "dark" ? styles.darkBand : undefined}>
      <div className={`${styles.wrap} ${styles.split}`}>
        <div><Header c={c} center={false} />{details}</div>
        {form}
      </div>
    </div>
  );
}

type Order = { currency: string; lines: { label: string; amount: number }[]; subtotal: number; discount: number; total: number };
const money = (currency: string, n: number) => `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** Registration: choose a type, add-ons and a discount code; the server prices it, then test payment. */
function Registration({ c }: { c: Ctx }) {
  const d = registrationData(c.section.data, c.ctx.event);
  const cats = list(d.categories), addons = list(d.addons), currency = str(d.currency) || "USD";
  const period = currentPeriod(d), periodId = str(period?.id);
  const offered = cats.filter(x => priceIn(x, periodId) !== null);
  const [category, setCategory] = useState(str(offered[0]?.id));
  const [qty, setQty] = useState<Record<string, number>>({});
  const [code, setCode] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [note, setNote] = useState("");
  const [pay, setPay] = useState<{ id: number; token: string; order: Order } | null>(null);
  const [done, setDone] = useState("");
  const chosen = cats.find(x => str(x.id) === category);
  const estimate = (priceIn(chosen, periodId) ?? 0) + addons.reduce((sum, a) => sum + (Number(a.price) || 0) * (qty[str(a.id)] ?? 0), 0);
  const base = `/api/public/forms/${encodeURIComponent(c.ctx.siteId ?? "")}/${encodeURIComponent(c.section.id)}`;
  const payload = () => ({ category, addons: qty, discount_code: code.trim() });

  async function applyCode() {
    if (c.edit || !c.ctx.siteId) return;
    setNote("");
    const res = await fetch(`${base}/quote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload()) });
    const body = await res.json().catch(() => null);
    if (res.ok) { setOrder(body.order); setNote(body.order.discount ? "Discount applied." : ""); } else { setOrder(null); setNote(body?.detail ?? "This code could not be checked."); }
  }
  async function payNow() {
    if (!pay) return;
    const res = await fetch(`${base}/pay-test/${pay.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payment_token: pay.token }) });
    const body = await res.json().catch(() => null);
    if (res.ok) setDone(body.message); else setNote(body?.detail ?? "Payment failed.");
  }

  const picker = (
    <div className={styles.regPicker}>
      <p className={styles.regPeriod}>{period
        ? <>{str(period.name) || "Current"} prices{str(period.ends) && <> · until {new Date(str(period.ends)).toLocaleDateString()}</>}</>
        : "Set up price periods in Event details to show prices."}</p>
      {c.edit && !cats.length && <p className={styles.muted}>No ticket types yet. Open <strong>Event details</strong> in the top bar, or tick ticket types in the panel on the right.</p>}
      <div className={styles.regTypes} role="radiogroup" aria-label="Registration type">
        {cats.map((x, i) => {
          const price = priceIn(x, periodId);
          if (price === null && !c.edit) return null;
          return (
            <label key={str(x.id) || i} className={styles.regType} data-active={str(x.id) === category || undefined} style={price === null ? { opacity: .55 } : undefined}>
              <input type="radio" name="_category" checked={str(x.id) === category} onChange={() => { setCategory(str(x.id)); setOrder(null); }} disabled={!!c.edit} />
              <T c={c} path={["categories", i, "name"]} tag="strong" placeholder="type name" />
              {str(x.description) && <small className={styles.muted}>{str(x.description)}</small>}
              <span>{price === null ? "Not offered now" : money(currency, price)}</span>
            </label>
          );
        })}
      </div>
      {addons.map((a, i) => (
        <label key={str(a.id) || i} className={styles.regAddon}>
          <span><T c={c} path={["addons", i, "name"]} placeholder="add-on" /> <small>{money(currency, Number(a.price) || 0)} each{str(a.description) && ` · ${str(a.description)}`}</small></span>
          <select value={qty[str(a.id)] ?? 0} disabled={!!c.edit} onChange={e => { setQty(q => ({ ...q, [str(a.id)]: Number(e.target.value) })); setOrder(null); }}>
            {Array.from({ length: (Number(a.max) || 5) + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      ))}
      <div className={styles.regCode}>
        <input placeholder="Discount code" value={code} disabled={!!c.edit} onChange={e => { setCode(e.target.value); setOrder(null); }} aria-label="Discount code" />
        <button type="button" className={styles.button} onClick={() => void applyCode()} disabled={!code.trim()}>Apply</button>
      </div>
      {note && <p className={order?.discount ? styles.formSuccess : styles.formError}>{note}</p>}
      <p className={styles.regTotal}>Total <strong>{money(currency, order ? order.total : estimate)}</strong>{order?.discount ? <small> (−{money(currency, order.discount)})</small> : null}</p>
    </div>
  );

  return (
    <div className={`${styles.wrap} ${styles.narrow}`}>
      <Header c={c} />
      {!c.edit && (!period || !offered.length) ? <p role="status" className={styles.form}>Registration is closed.</p>
        : done ? <p role="status" className={`${styles.form} ${styles.formSuccess}`}>{done}</p> : pay ? (
        <div className={styles.form}>
          <h3>Payment <small className={styles.muted}>(test mode, no money is charged)</small></h3>
          {pay.order.lines.map((l, i) => <p key={i} className={styles.regLine}><span>{l.label}</span><span>{money(pay.order.currency, l.amount)}</span></p>)}
          {pay.order.discount > 0 && <p className={styles.regLine}><span>Discount</span><span>−{money(pay.order.currency, pay.order.discount)}</span></p>}
          <p className={styles.regTotal}>Total <strong>{money(pay.order.currency, pay.order.total)}</strong></p>
          <label>Card number<input value="4242 4242 4242 4242" readOnly /></label>
          <button type="button" className={styles.button} data-primary onClick={() => void payNow()}>Pay {money(pay.order.currency, pay.order.total)} (test)</button>
          {note && <p className={styles.formError}>{note}</p>}
        </div>
      ) : (
        <WebsiteForm c={c} top={picker} extra={payload}
          onResult={body => { if (body.submission_id) { setPay({ id: Number(body.submission_id), token: String(body.payment_token), order: body.order as Order }); return true; } return false; }}>
          <T c={c} path={["btn_text"]} placeholder="button text" />
          {!str(d.btn_text) && !c.edit && "Continue to payment"}
        </WebsiteForm>
      )}
    </div>
  );
}

/** A button anywhere on the page that opens a form in a popup. */
function FormButton({ c }: { c: Ctx }) {
  const d = c.section.data;
  const [open, setOpen] = useState(false);
  return (
    <div className={`${styles.wrap} ${styles.buttonForm}`}>
      <T c={c} path={["section_title"]} tag="h2" className={styles.title} placeholder="heading (optional)" />
      <button type="button" className={styles.button} data-primary onClick={() => { if (!c.edit) setOpen(true); }}>
        <T c={c} path={["btn_label"]} placeholder="button text" />
        {!str(d.btn_label) && !c.edit && "Contact us"}
      </button>
      {c.edit?.selection?.sectionId === c.section.id && <WebsiteForm c={c}>{str(d.submit_label) || "Send"}</WebsiteForm>}
      {open && (
        <div className={styles.popup} role="dialog" aria-modal="true" aria-label={str(d.popup_title) || "Form"}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }} onKeyDown={e => { if (e.key === "Escape") setOpen(false); }}>
          <div className={styles.popupCard}>
            <button type="button" className={styles.popupClose} onClick={() => setOpen(false)} aria-label="Close"><Icon name="close" size={16} /></button>
            {str(d.popup_title) && <h3>{str(d.popup_title)}</h3>}
            {str(d.popup_text) && <p className={styles.muted}>{str(d.popup_text)}</p>}
            <WebsiteForm c={c}>{str(d.submit_label) || "Send"}</WebsiteForm>
          </div>
        </div>
      )}
    </div>
  );
}

function Footer({ c }: { c: Ctx }) {
  const links = list(c.section.data.links);
  return (
    <footer className={styles.footer}>
      <div>
        <T c={c} path={["brand_name"]} tag="strong" className={styles.footerBrand} placeholder="name" />
        <T c={c} path={["tagline"]} tag="p" placeholder="short description" multiline />
        <T c={c} path={["copyright"]} tag="small" placeholder="copyright line" />
      </div>
      <nav aria-label="Footer">
        {links.map((l, i) => <a key={i} href={href(c, l.url)}><T c={c} path={["links", i, "label"]} placeholder="link text" /></a>)}
      </nav>
    </footer>
  );
}

function Cards({ c }: { c: Ctx }) {
  const items = list(c.section.data.items);
  const design = ["grid", "list", "spotlight"].includes(str(c.section.data.design)) ? str(c.section.data.design) : "grid";
  return (
    <div className={styles.wrap}>
      <Header c={c} center={design !== "list"} />
      <div className={styles.grid} data-design={design}>
        {items.map((item, i) => (
          <article key={i} className={styles.card}>
            <Img className={styles.cardImage} src={item.image} alt={str(item.title)} />
            <T c={c} path={["items", i, "title"]} tag="h3" placeholder="title" />
            <T c={c} path={["items", i, "description"]} tag="p" className={styles.muted} placeholder="description" multiline />
          </article>
        ))}
      </div>
    </div>
  );
}

function ImageBlock({ c }: { c: Ctx }) {
  const d = c.section.data;
  return (
    <figure className={`${styles.wrap} ${styles.single}`}>
      {safeImage(d.image_url) ? <Img src={d.image_url} alt={str(d.caption)} /> : <EmptyImage edit={c.edit} />}
      <T c={c} path={["caption"]} tag="figcaption" className={styles.muted} placeholder="caption" />
    </figure>
  );
}

function Custom({ c }: { c: Ctx }) {
  const d = c.section.data;
  const height = Math.min(2000, Math.max(100, Number(d.height) || 300));
  // sandbox="" blocks scripts, forms and navigation from custom code.
  return <iframe title="Custom section" sandbox="" srcDoc={str(d.html)} className={styles.custom} style={{ height }} />;
}

function nodeStyle(n: Rec, columns: number): React.CSSProperties {
  const hex = (v: unknown) => (/^#[0-9a-f]{3,8}$/i.test(str(v)) ? str(v) : undefined);
  return {
    gridColumn: `span ${Math.min(columns, Math.max(1, Number(n.span) || 1))}`,
    fontSize: Math.min(120, Math.max(10, Number(n.size) || 18)),
    padding: Math.min(120, Math.max(0, Number(n.padding) || 0)),
    borderRadius: Math.min(80, Math.max(0, Number(n.radius) || 0)),
    textAlign: n.align === "center" ? "center" : "left",
    color: hex(n.color),
    background: n.effect === "gradient" && hex(n.start) && hex(n.end) ? `linear-gradient(120deg, ${hex(n.start)}, ${hex(n.end)})` : hex(n.background),
  };
}

function Content({ c }: { c: Ctx }) {
  const d = c.section.data;
  const nodes = list(d.nodes);
  const columns = Math.min(6, Math.max(1, Number(d.columns) || 1));
  return (
    <div className={`${styles.wrap} ${styles.nodes}`} style={{ "--cols": columns, gap: Math.min(80, Number(d.gap) || 16) } as React.CSSProperties}>
      {nodes.map((n, i) => {
        const kind = str(n.kind), style = nodeStyle(n, columns);
        if (kind === "divider") return <hr key={i} className={styles.divider} />;
        if (kind === "icon") return <span key={i} style={style} className={styles.accentText} aria-hidden="true"><Icon name="grid" size={32} /></span>;
        if (kind === "button") return (
          <div key={i} style={{ gridColumn: style.gridColumn, textAlign: style.textAlign }}>
            <a className={styles.button} data-primary href={href(c, n.url)} style={{ fontSize: style.fontSize }}>
              <T c={c} path={["nodes", i, "text"]} placeholder="button text" />
            </a>
          </div>
        );
        if (kind === "menu") return (
          <nav key={i} style={style} className={styles.nodeMenu}>
            <T c={c} path={["nodes", i, "text"]} tag="strong" placeholder="menu title" />
            {str(n.links).split(/\r?\n/).filter(Boolean).map((line, j) => {
              const [label, url] = line.split("|");
              return <a key={j} href={href(c, url?.trim())}>{label.trim()}</a>;
            })}
          </nav>
        );
        return (
          <div key={i} style={style}>
            <T c={c} path={["nodes", i, "text"]} tag={kind === "heading" ? "h2" : "p"} className={styles.node} placeholder="text" multiline />
          </div>
        );
      })}
    </div>
  );
}

function KeyDates({ c }: { c: Ctx }) {
  const today = new Date().toISOString().slice(0, 10);
  const dates = keyDates(c.ctx.event, c.section.data);
  return (
    <div className={`${styles.wrap} ${styles.narrow}`}>
      <Header c={c} />
      {!dates.length ? (c.edit ? <p className={styles.muted}>Add dates in <strong>Event details</strong> (top bar): price periods, deadlines and the event dates.</p> : null) : (
        <ol className={styles.dates}>
          {dates.map((x, i) => (
            <li key={i} data-passed={x.date < today || undefined}>
              <time dateTime={x.date}>{new Date(`${x.date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}</time>
              <span>{x.name}{x.date < today && <small> · Passed</small>}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const blocks: Record<string, (props: { c: Ctx }) => ReactNode> = {
  key_dates: KeyDates,
  features: Features, speakers: Speakers, pricing: Pricing, gallery: Gallery, faq: Faq, contact: Contact, footer: Footer,
  about: Cards, stats: Cards, agenda: Cards, sponsors: Cards, testimonials: Cards, announcement: Cards,
  image: ImageBlock, custom: Custom, content: Content, form_button: FormButton, registration: Registration,
};

export function hasBlock(type: string) {
  return Object.hasOwn(blocks, type);
}

export function SectionBlock({ section, ctx, edit }: { section: Section; ctx: LinkContext; edit?: EditHooks }) {
  const Block = blocks[section.type];
  return Block ? <Block c={{ section, edit, ctx }} /> : null;
}
