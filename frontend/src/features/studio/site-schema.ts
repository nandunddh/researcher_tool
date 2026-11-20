/**
 * Element model for the SciStudio canvas.
 *
 * Sections are stored in the existing `schema_json` array. A section that has been
 * upgraded carries `elements` (and optionally `section_style`) next to its legacy
 * `data`. The legacy fields are re-written from the elements on save so the current
 * Python publisher keeps working until React renders published sites.
 *
 * Everything read from a saved document is untrusted: values are validated here and
 * only sanitized values ever reach the renderer or the generated CSS.
 */
import type { Json, Section } from "./document";

export type Viewport = "desktop" | "tablet" | "mobile";
export const viewports: readonly Viewport[] = ["desktop", "tablet", "mobile"];

export type Link =
  | { type: "page"; pageId: string }
  | { type: "section"; sectionId: string }
  | { type: "url"; href: string; newTab?: boolean }
  | { type: "email"; address: string }
  | { type: "phone"; number: string };

export type Style = {
  color?: string;
  background?: string;
  fontSize?: number;
  fontWeight?: number;
  textAlign?: "left" | "center" | "right";
  radius?: number;
  paddingX?: number;
  paddingY?: number;
  width?: number;
};
export type SectionStyle = { background?: string; color?: string; paddingY?: number };
export type Responsive<T> = { desktop: T; tablet?: T; mobile?: T };

export type MenuItem = { id: string; label: string; link?: Link; meta?: Record<string, Json> };
export type ElementKind = "logo" | "heading" | "text" | "button" | "image" | "menu";
export type SiteElement = {
  id: string;
  kind: ElementKind;
  slot: string;
  role?: string;
  text?: string;
  mode?: "text" | "image";
  src?: string;
  alt?: string;
  items?: MenuItem[];
  link?: Link;
  style: Responsive<Style>;
};
export type PageRef = { id: string; name?: string; slug?: string; is_home?: boolean };
export type LinkContext = { sections: Section[]; pages?: PageRef[]; siteSlug?: string };

export const elementSections = ["navbar", "hero"] as const;
const MAX_TEXT = 5000;
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const WEIGHTS = [300, 400, 500, 600, 700, 800];
const KINDS: readonly ElementKind[] = ["logo", "heading", "text", "button", "image", "menu"];

export function newId(prefix = "el"): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

// ---------------------------------------------------------------- sanitizers
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown, max = MAX_TEXT) => (typeof v === "string" ? v.slice(0, max) : "");

export function safeColor(v: unknown): string | undefined {
  return typeof v === "string" && (HEX.test(v) || v === "transparent") ? v : undefined;
}
function clamp(v: unknown, min: number, max: number): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : undefined;
}
/** Links a visitor may follow: web, mail, phone, same-page anchors and site paths. */
export function safeUrl(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const url = v.trim();
  if (!url || url.length > 2048 || /[\s\u0000-\u001f<>"'`\\]/.test(url)) return undefined;
  return /^(https?:\/\/[^/]|mailto:|tel:|#[A-Za-z0-9_-]*$|\/(?!\/))/i.test(url) ? url : undefined;
}
export function safeImage(v: unknown): string | undefined {
  if (typeof v !== "string" || v.length > 2_000_000 || /[\s<>"'`\\]/.test(v)) return undefined;
  return /^(https?:\/\/[^/]|\/(?!\/)|data:image\/(png|jpeg|webp|gif);base64,)/i.test(v) ? v : undefined;
}
const EMAIL = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[A-Za-z]{2,}$/;
const PHONE = /^\+?[0-9 ()-]{3,30}$/;

export function cleanLink(v: unknown): Link | undefined {
  if (!isRecord(v)) return undefined;
  switch (v.type) {
    case "page": return typeof v.pageId === "string" && ID.test(v.pageId) ? { type: "page", pageId: v.pageId } : undefined;
    case "section": return typeof v.sectionId === "string" && ID.test(v.sectionId) ? { type: "section", sectionId: v.sectionId } : undefined;
    case "url": { const href = safeUrl(v.href); return href ? { type: "url", href, ...(v.newTab === true ? { newTab: true } : {}) } : undefined; }
    case "email": return typeof v.address === "string" && EMAIL.test(v.address.trim()) ? { type: "email", address: v.address.trim() } : undefined;
    case "phone": return typeof v.number === "string" && PHONE.test(v.number.trim()) ? { type: "phone", number: v.number.trim() } : undefined;
    default: return undefined;
  }
}

export function cleanStyle(v: unknown): Style {
  if (!isRecord(v)) return {};
  const out: Style = {};
  const color = safeColor(v.color); if (color) out.color = color;
  const background = safeColor(v.background); if (background) out.background = background;
  const fontSize = clamp(v.fontSize, 8, 160); if (fontSize !== undefined) out.fontSize = fontSize;
  if (typeof v.fontWeight === "number" && WEIGHTS.includes(v.fontWeight)) out.fontWeight = v.fontWeight;
  if (v.textAlign === "left" || v.textAlign === "center" || v.textAlign === "right") out.textAlign = v.textAlign;
  const radius = clamp(v.radius, 0, 200); if (radius !== undefined) out.radius = radius;
  const px = clamp(v.paddingX, 0, 200); if (px !== undefined) out.paddingX = px;
  const py = clamp(v.paddingY, 0, 200); if (py !== undefined) out.paddingY = py;
  const width = clamp(v.width, 16, 2000); if (width !== undefined) out.width = width;
  return out;
}
export function cleanSectionStyle(v: unknown): SectionStyle {
  if (!isRecord(v)) return {};
  const out: SectionStyle = {};
  const background = safeColor(v.background); if (background) out.background = background;
  const color = safeColor(v.color); if (color) out.color = color;
  const py = clamp(v.paddingY, 0, 400); if (py !== undefined) out.paddingY = py;
  return out;
}
function cleanResponsive<T>(v: unknown, clean: (x: unknown) => T): Responsive<T> {
  const r = isRecord(v) ? v : {};
  const out: Responsive<T> = { desktop: clean(r.desktop) };
  if (isRecord(r.tablet)) out.tablet = clean(r.tablet);
  if (isRecord(r.mobile)) out.mobile = clean(r.mobile);
  return out;
}

function cleanItems(v: unknown): MenuItem[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 40).flatMap(item => {
    if (!isRecord(item)) return [];
    const id = typeof item.id === "string" && ID.test(item.id) ? item.id : newId("item");
    const link = cleanLink(item.link);
    const meta = isRecord(item.meta) ? (structuredClone(item.meta) as Record<string, Json>) : undefined;
    return [{ id, label: str(item.label, 200), ...(link ? { link } : {}), ...(meta ? { meta } : {}) }];
  });
}

/** Validates stored elements. Invalid elements are dropped, duplicate IDs replaced. */
export function cleanElements(v: unknown): SiteElement[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  return v.slice(0, 200).flatMap(raw => {
    if (!isRecord(raw) || !KINDS.includes(raw.kind as ElementKind)) return [];
    let id = typeof raw.id === "string" && ID.test(raw.id) ? raw.id : newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    const el: SiteElement = {
      id,
      kind: raw.kind as ElementKind,
      slot: typeof raw.slot === "string" && ID.test(raw.slot) ? raw.slot : "content",
      style: cleanResponsive(raw.style, cleanStyle),
    };
    if (typeof raw.role === "string" && ID.test(raw.role)) el.role = raw.role;
    if (typeof raw.text === "string") el.text = str(raw.text);
    if (raw.mode === "text" || raw.mode === "image") el.mode = raw.mode;
    const src = safeImage(raw.src); if (src) el.src = src;
    if (typeof raw.alt === "string") el.alt = str(raw.alt, 300);
    if (el.kind === "menu") el.items = cleanItems(raw.items);
    const link = cleanLink(raw.link); if (link) el.link = link;
    return [el];
  });
}

// ---------------------------------------------------------------- section access
export function getElements(section: Section): SiteElement[] | undefined {
  return Array.isArray(section.elements) ? cleanElements(section.elements) : undefined;
}
export function withElements(section: Section, elements: SiteElement[]): Section {
  return { ...section, elements: elements as unknown as Json };
}
export function getSectionStyle(section: Section): Responsive<SectionStyle> {
  return cleanResponsive(section.section_style, cleanSectionStyle);
}
export function withSectionStyle(section: Section, style: Responsive<SectionStyle>): Section {
  return { ...section, section_style: style as unknown as Json };
}

const legacyAnchors: Record<string, string> = {
  features: "features", speakers: "speakers", pricing: "pricing", gallery: "gallery", faq: "faq",
  contact: "contact", about: "about", agenda: "agenda", sponsors: "sponsors",
};
/** The anchor visitors jump to for "Section on this page" links. */
export function sectionAnchor(section: Section): string {
  if (typeof section.anchor === "string" && ID.test(section.anchor)) return section.anchor;
  return legacyAnchors[section.type] ?? (ID.test(section.id) ? section.id : "top");
}

export function linkHref(link: Link | undefined, ctx: LinkContext): string {
  if (!link) return "#";
  switch (link.type) {
    case "page": {
      const page = ctx.pages?.find(p => p.id === link.pageId);
      if (!page || !ctx.siteSlug) return "#";
      const slug = (page.slug || "").replace(/^\/+|\/+$/g, "");
      const base = `/sites/${encodeURIComponent(ctx.siteSlug)}`;
      return page.is_home || !slug ? base : `${base}/${slug.split("/").map(encodeURIComponent).join("/")}`;
    }
    case "section": {
      const section = ctx.sections.find(s => s.id === link.sectionId);
      return section ? `#${sectionAnchor(section)}` : "#";
    }
    case "url": return safeUrl(link.href) ?? "#";
    case "email": return EMAIL.test(link.address) ? `mailto:${link.address}` : "#";
    case "phone": return PHONE.test(link.number) ? `tel:${link.number.replace(/[ ()-]/g, "")}` : "#";
  }
}

/** Turns a legacy href into a structured link for the link chooser. */
export function hrefToLink(href: unknown, ctx: LinkContext): Link | undefined {
  if (typeof href !== "string" || !href.trim() || href.trim() === "#") return undefined;
  const value = href.trim();
  if (value.startsWith("mailto:")) return cleanLink({ type: "email", address: value.slice(7) });
  if (value.startsWith("tel:")) return cleanLink({ type: "phone", number: value.slice(4) });
  if (value.startsWith("#")) {
    const target = ctx.sections.find(s => sectionAnchor(s) === value.slice(1) || s.id === value.slice(1));
    if (target) return { type: "section", sectionId: target.id };
  }
  return cleanLink({ type: "url", href: value });
}

// ---------------------------------------------------------------- legacy upgrade
const text = (v: unknown) => (typeof v === "string" ? v : "");
const el = (kind: ElementKind, slot: string, role: string, extra: Partial<SiteElement> = {}): SiteElement =>
  ({ id: newId(), kind, slot, role, style: { desktop: {} }, ...extra });

/** Adds elements to a legacy navbar/hero. Other sections are returned unchanged. */
export function upgradeSection(section: Section, ctx: LinkContext): Section {
  if (getElements(section) || !(elementSections as readonly string[]).includes(section.type)) return section;
  const d = section.data;
  if (section.type === "navbar") {
    const links = Array.isArray(d.links) ? d.links : [];
    const items: MenuItem[] = links.flatMap(raw => {
      if (!isRecord(raw)) return [];
      const { label, url, ...meta } = raw;
      const link = hrefToLink(url, ctx);
      const target = meta.target === "_blank";
      return [{
        id: newId("item"),
        label: text(label),
        ...(link ? { link: link.type === "url" && target ? { ...link, newTab: true } : link } : {}),
        ...(Object.keys(meta).length ? { meta: structuredClone(meta) as Record<string, Json> } : {}),
      }];
    });
    const logoSrc = safeImage(d.logo_url);
    return withElements(section, [
      el("logo", "brand", "logo", { text: text(d.brand_name), mode: d.brand_mode === "image" && logoSrc ? "image" : "text", ...(logoSrc ? { src: logoSrc } : {}), alt: text(d.brand_name) }),
      el("menu", "links", "menu", { items }),
      el("button", "actions", "cta", { text: text(d.cta_label), link: hrefToLink(d.cta_link ?? d.cta_url, ctx) }),
    ]);
  }
  const image = safeImage(d.hero_image);
  return withElements(section, [
    el("text", "content", "eyebrow", { text: text(d.eyebrow) }),
    el("heading", "content", "headline", { text: text(d.headline) }),
    el("text", "content", "subheadline", { text: text(d.subheadline) }),
    el("button", "actions", "primary", { text: text(d.primary_btn_text), link: hrefToLink(d.primary_btn_url, ctx) }),
    el("button", "actions", "secondary", { text: text(d.secondary_btn_text), link: hrefToLink(d.secondary_btn_url, ctx) }),
    el("image", "media", "image", { ...(image ? { src: image } : {}), alt: text(d.headline) }),
  ]);
}

/** Writes element content back into the legacy fields read by the Python publisher. */
export function syncLegacy(section: Section, ctx: LinkContext): Section {
  const elements = getElements(section);
  if (!elements) return section;
  const by = (role: string) => elements.find(e => e.role === role);
  const data: Record<string, Json> = { ...section.data };
  if (section.type === "navbar") {
    const logo = by("logo"), menu = by("menu"), cta = by("cta");
    if (logo) Object.assign(data, { brand_name: logo.text ?? "", brand_mode: logo.mode === "image" && logo.src ? "image" : "text", logo_url: logo.src ?? "" });
    if (menu) data.links = (menu.items ?? []).map(item => ({
      ...(item.meta ?? {}),
      label: item.label,
      url: linkHref(item.link, ctx),
      ...(item.link?.type === "url" && item.link.newTab ? { target: "_blank" } : {}),
    }));
    if (cta) Object.assign(data, { cta_label: cta.text ?? "", cta_link: linkHref(cta.link, ctx) });
  } else if (section.type === "hero") {
    const set = (role: string, key: string) => { const e = by(role); if (e) data[key] = e.text ?? ""; };
    set("eyebrow", "eyebrow"); set("headline", "headline"); set("subheadline", "subheadline");
    set("primary", "primary_btn_text"); set("secondary", "secondary_btn_text");
    const primary = by("primary"), secondary = by("secondary"), image = by("image");
    if (primary) data.primary_btn_url = linkHref(primary.link, ctx);
    if (secondary) data.secondary_btn_url = linkHref(secondary.link, ctx);
    if (image) data.hero_image = image.src ?? "";
  }
  return { ...section, data };
}

// ---------------------------------------------------------------- styles
export function resolveStyle<T extends object>(style: Responsive<T>, viewport: Viewport): T {
  if (viewport === "desktop") return { ...style.desktop };
  if (viewport === "tablet") return { ...style.desktop, ...style.tablet };
  return { ...style.desktop, ...style.tablet, ...style.mobile };
}

function elementDecls(s: Style, kind: ElementKind): string[] {
  const out: string[] = [];
  if (s.color) out.push(`color:${s.color}`);
  if (s.background) out.push(`background:${s.background}`);
  if (s.fontSize !== undefined) out.push(`font-size:${s.fontSize}px`);
  if (s.fontWeight !== undefined) out.push(`font-weight:${s.fontWeight}`);
  if (s.textAlign) out.push(`text-align:${s.textAlign}`);
  if (s.radius !== undefined) out.push(`border-radius:${s.radius}px`);
  if (s.paddingY !== undefined) out.push(`padding-block:${s.paddingY}px`);
  if (s.paddingX !== undefined) out.push(`padding-inline:${s.paddingX}px`);
  if (s.width !== undefined) out.push(kind === "image" || kind === "logo" ? `width:${s.width}px;max-width:100%` : `max-width:${s.width}px`);
  return out;
}
function sectionDecls(s: SectionStyle): string[] {
  const out: string[] = [];
  if (s.background) out.push(`background:${s.background}`);
  if (s.color) out.push(`color:${s.color}`);
  if (s.paddingY !== undefined) out.push(`padding-block:${s.paddingY}px`);
  return out;
}

/** Scoped CSS for the whole page. Breakpoints use container queries so the canvas
 *  preview widths behave exactly like real screens. */
export function buildSiteCss(sections: Section[]): string {
  const layers: Record<Viewport, string[]> = { desktop: [], tablet: [], mobile: [] };
  for (const section of sections) {
    if (ID.test(section.id)) {
      const ss = getSectionStyle(section);
      for (const vp of viewports) {
        const decls = sectionDecls((vp === "desktop" ? ss.desktop : ss[vp]) ?? {});
        if (decls.length) layers[vp].push(`[data-section="${section.id}"]{${decls.join(";")}}`);
      }
    }
    for (const e of getElements(section) ?? []) {
      for (const vp of viewports) {
        const decls = elementDecls((vp === "desktop" ? e.style.desktop : e.style[vp]) ?? {}, e.kind);
        if (decls.length) layers[vp].push(`[data-el="${e.id}"]{${decls.join(";")}}`);
      }
    }
  }
  return [
    layers.desktop.join("\n"),
    layers.tablet.length ? `@container sci-site (max-width: 1023px){${layers.tablet.join("\n")}}` : "",
    layers.mobile.length ? `@container sci-site (max-width: 640px){${layers.mobile.join("\n")}}` : "",
  ].filter(Boolean).join("\n");
}
