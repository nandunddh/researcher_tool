"use client";
/**
 * React versions of every content section, drawn from the section's real `data`.
 * Used by the editor canvas, the preview page and (later) the published site.
 */
import { useState, type ReactNode } from "react";
import type { Json, Section } from "./document";
import { safeImage, safeUrl, type LinkContext } from "./site-schema";
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
  return (
    <EditableText key={`${path.join(".")}:${text}`} tag={tag} className={className} value={text} edit={c.edit}
      placeholder={placeholder} multiline={multiline}
      onCommit={next => c.edit?.onField?.(c.section.id, path, next)} />
  );
}

function href(c: Ctx, value: unknown) {
  return c.edit ? undefined : safeUrl(value) ?? "#";
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

function Speakers({ c }: { c: Ctx }) {
  const people = list(c.section.data.speakers);
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
            {safeImage(img.url) ? <Img src={img.url} alt={str(img.caption)} /> : c.edit && <div className={styles.photoEmpty}>Add an image</div>}
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

function Contact({ c }: { c: Ctx }) {
  const d = c.section.data;
  const [sent, setSent] = useState(false);
  const addressKey = str(d.address) || !str(d.location) ? "address" : "location";
  const buttonKey = str(d.btn_text) || !str(d.form_button_label) ? "btn_text" : "form_button_label";
  return (
    <div className={`${styles.wrap} ${styles.split}`}>
      <div>
        <Header c={c} center={false} />
        <ul className={styles.contactList}>
          {(str(d.email) || c.edit) && <li><Icon name="doc" size={16} /><T c={c} path={["email"]} placeholder="email address" /></li>}
          {(str(d.phone) || c.edit) && <li><Icon name="mobile" size={16} /><T c={c} path={["phone"]} placeholder="phone number" /></li>}
          {(str(d[addressKey]) || c.edit) && <li><Icon name="grid" size={16} /><T c={c} path={[addressKey]} placeholder="address" /></li>}
        </ul>
      </div>
      <form className={styles.form} onSubmit={e => { e.preventDefault(); if (!c.edit) setSent(true); }}>
        <label>Name<input name="name" autoComplete="name" disabled={!!c.edit} /></label>
        <label>Email<input name="email" type="email" autoComplete="email" disabled={!!c.edit} /></label>
        <label>Message<textarea name="message" rows={4} disabled={!!c.edit} /></label>
        <button type="submit" className={styles.button} data-primary>
          <T c={c} path={[buttonKey]} placeholder="button text" />
          {!str(d[buttonKey]) && !c.edit && "Send message"}
        </button>
        {sent && <p role="status" className={styles.muted}>Thank you. Form delivery is not connected yet.</p>}
      </form>
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
      {safeImage(d.image_url) ? <Img src={d.image_url} alt={str(d.caption)} /> : c.edit && <div className={styles.photoEmpty}>Add an image</div>}
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

const blocks: Record<string, (props: { c: Ctx }) => ReactNode> = {
  features: Features, speakers: Speakers, pricing: Pricing, gallery: Gallery, faq: Faq, contact: Contact, footer: Footer,
  about: Cards, stats: Cards, agenda: Cards, sponsors: Cards, testimonials: Cards, announcement: Cards,
  image: ImageBlock, custom: Custom, content: Content,
};

export function hasBlock(type: string) {
  return Object.hasOwn(blocks, type);
}

export function SectionBlock({ section, ctx, edit }: { section: Section; ctx: LinkContext; edit?: EditHooks }) {
  const Block = blocks[section.type];
  return Block ? <Block c={{ section, edit, ctx }} /> : null;
}
