import { readDocument, type Json, type Section } from "./document";
import {
  cleanLink, cleanSectionStyle, cleanStyle, getElements, getSectionStyle, newId, safeImage, syncLegacy,
  upgradeSection, withElements, withSectionStyle,
  type Link, type LinkContext, type MenuItem, type PageRef, type SectionStyle, type SiteElement, type Style, type Viewport,
} from "./site-schema";

export type EditorSite = {
  site_id: string;
  name: string;
  slug?: string;
  status?: string;
  schema_json: Section[];
  pages?: (PageRef & { schema_json?: Section[]; [key: string]: unknown })[];
  active_page_id?: string;
  [key: string]: unknown;
};
export type Selection = { sectionId: string; elementId?: string };

export const sectionLayouts: Record<string, Record<string, string>> = {
  navbar: { business: "Business", portfolio: "Portfolio", services: "Services", product: "Product", editorial: "Editorial" },
  hero: {
    split: "Image right", image_left: "Image left", centered: "Centered", image_top: "Image above",
    text_only: "Text only", conference_program: "Conference program",
  },
};

export function linkContext(site: EditorSite): LinkContext {
  return { sections: site.schema_json, pages: site.pages, siteSlug: site.slug };
}

/** Validates the loaded document and adds elements to navbar/hero sections. */
export function prepareSite(site: EditorSite): EditorSite {
  const sections = readDocument(site.schema_json).sections;
  const ctx = { ...linkContext(site), sections };
  return { ...site, schema_json: sections.map(s => upgradeSection(s, ctx)) };
}

function mapSection(site: EditorSite, sectionId: string, fn: (s: Section) => Section): EditorSite {
  const index = site.schema_json.findIndex(s => s.id === sectionId);
  if (index < 0) throw new Error("This section no longer exists.");
  const schema_json = [...site.schema_json];
  schema_json[index] = fn(structuredClone(schema_json[index]));
  return { ...site, schema_json };
}
function mapElement(site: EditorSite, sectionId: string, elementId: string, fn: (e: SiteElement) => SiteElement): EditorSite {
  return mapSection(site, sectionId, section => {
    const elements = getElements(section);
    const index = elements?.findIndex(e => e.id === elementId) ?? -1;
    if (!elements || index < 0) throw new Error("This item no longer exists.");
    elements[index] = fn(elements[index]);
    return withElements(section, elements);
  });
}

export function findElement(site: EditorSite, selection: Selection | null) {
  const section = selection ? site.schema_json.find(s => s.id === selection.sectionId) : undefined;
  const element = section && selection?.elementId ? getElements(section)?.find(e => e.id === selection.elementId) : undefined;
  return { section, element };
}

// ---------------------------------------------------------------- sections
export function setLayout(site: EditorSite, sectionId: string, value: string): EditorSite {
  const section = site.schema_json.find(s => s.id === sectionId);
  const layouts = section ? sectionLayouts[section.type] : undefined;
  if (!section || !layouts || !Object.hasOwn(layouts, value)) throw new Error("Unsupported layout");
  if ((section.data.layout_variant || Object.keys(layouts)[0]) === value) return site;
  return mapSection(site, sectionId, s => ({ ...s, data: { ...s.data, layout_variant: value } }));
}

export function setSectionStyle(site: EditorSite, sectionId: string, viewport: Viewport, patch: Partial<Record<keyof SectionStyle, unknown>>): EditorSite {
  return mapSection(site, sectionId, section => {
    const style = getSectionStyle(section);
    const merged: Record<string, unknown> = { ...(style[viewport] ?? {}) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === null || value === "") delete merged[key];
      else merged[key] = value;
    }
    return withSectionStyle(section, { ...style, [viewport]: cleanSectionStyle(merged) });
  });
}

export function moveSection(site: EditorSite, id: string, delta: number): EditorSite {
  const index = site.schema_json.findIndex(s => s.id === id), target = index + delta;
  if (index < 0 || target < 0 || target >= site.schema_json.length) return site;
  const schema_json = [...site.schema_json];
  const [item] = schema_json.splice(index, 1);
  schema_json.splice(target, 0, item);
  return { ...site, schema_json };
}

/** Copies a section (with new IDs) right below the original. */
export function duplicateSection(site: EditorSite, id: string): EditorSite {
  const index = site.schema_json.findIndex(s => s.id === id);
  if (index < 0) return site;
  const schema_json = [...site.schema_json];
  schema_json.splice(index + 1, 0, freshCopy(site.schema_json[index]));
  return { ...site, schema_json };
}

export function removeSection(site: EditorSite, id: string): EditorSite {
  if (!site.schema_json.some(s => s.id === id)) return site;
  return { ...site, schema_json: site.schema_json.filter(s => s.id !== id) };
}

export function dropSection(site: EditorSite, id: string, beforeId: string): EditorSite {
  if (id === beforeId || !site.schema_json.some(s => s.id === id) || !site.schema_json.some(s => s.id === beforeId)) return site;
  const schema_json = [...site.schema_json];
  const [item] = schema_json.splice(schema_json.findIndex(s => s.id === id), 1);
  schema_json.splice(schema_json.findIndex(s => s.id === beforeId), 0, item);
  return { ...site, schema_json };
}

export function insertSection(site: EditorSite, section: Section, afterId?: string): EditorSite {
  readDocument([...site.schema_json, section]);
  const copy = upgradeSection(structuredClone(section), linkContext(site));
  const schema_json = [...site.schema_json];
  const index = schema_json.findIndex(s => s.id === afterId);
  schema_json.splice(index < 0 ? schema_json.length : index + 1, 0, copy);
  return { ...site, schema_json };
}

// ---------------------------------------------------------------- elements
export type ElementPatch = { text?: string; mode?: "text" | "image"; src?: string; alt?: string; link?: Link | null };

export function updateElement(site: EditorSite, sectionId: string, elementId: string, patch: ElementPatch): EditorSite {
  return mapElement(site, sectionId, elementId, e => {
    const next = { ...e };
    if (patch.text !== undefined) next.text = String(patch.text).slice(0, 5000);
    if (patch.alt !== undefined) next.alt = String(patch.alt).slice(0, 300);
    if (patch.mode !== undefined) {
      if (patch.mode !== "text" && patch.mode !== "image") throw new Error("Invalid logo type");
      next.mode = patch.mode;
    }
    if (patch.src !== undefined) {
      if (patch.src === "") delete next.src;
      else {
        const src = safeImage(patch.src);
        if (!src) throw new Error("Use an uploaded image or a link starting with https://");
        next.src = src;
      }
    }
    if (patch.link !== undefined) {
      if (patch.link === null) delete next.link;
      else {
        const link = cleanLink(patch.link);
        if (!link) throw new Error("This link is not valid.");
        next.link = link;
      }
    }
    return next;
  });
}

/** Changes style for one screen size. Empty values remove the setting (falls back
 *  to the larger screen). */
export function setElementStyle(site: EditorSite, sectionId: string, elementId: string, viewport: Viewport, patch: Partial<Record<keyof Style, unknown>>): EditorSite {
  return mapElement(site, sectionId, elementId, e => {
    const merged: Record<string, unknown> = { ...(e.style[viewport] ?? {}) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === null || value === "") delete merged[key];
      else merged[key] = value;
    }
    return { ...e, style: { ...e.style, [viewport]: cleanStyle(merged) } };
  });
}

export function resetElementStyle(site: EditorSite, sectionId: string, elementId: string, viewport: Viewport): EditorSite {
  return mapElement(site, sectionId, elementId, e => {
    if (viewport === "desktop") return { ...e, style: { ...e.style, desktop: {} } };
    const style = { ...e.style };
    delete style[viewport];
    return { ...e, style };
  });
}

// ---------------------------------------------------------------- menus
function mapItems(site: EditorSite, sectionId: string, elementId: string, fn: (items: MenuItem[]) => MenuItem[]): EditorSite {
  return mapElement(site, sectionId, elementId, e => {
    if (e.kind !== "menu") throw new Error("Invalid navigation");
    return { ...e, items: fn([...(e.items ?? [])]) };
  });
}
export function addMenuItem(site: EditorSite, sectionId: string, elementId: string): EditorSite {
  return mapItems(site, sectionId, elementId, items => items.length >= 40 ? items : [...items, { id: newId("item"), label: "New link" }]);
}
export function updateMenuItem(site: EditorSite, sectionId: string, elementId: string, itemId: string, patch: { label?: string; link?: Link | null }): EditorSite {
  return mapItems(site, sectionId, elementId, items => items.map(item => {
    if (item.id !== itemId) return item;
    const next = { ...item };
    if (patch.label !== undefined) next.label = String(patch.label).slice(0, 200);
    if (patch.link === null) delete next.link;
    else if (patch.link !== undefined) {
      const link = cleanLink(patch.link);
      if (!link) throw new Error("This link is not valid.");
      next.link = link;
    }
    return next;
  }));
}
export function removeMenuItem(site: EditorSite, sectionId: string, elementId: string, itemId: string): EditorSite {
  return mapItems(site, sectionId, elementId, items => items.filter(item => item.id !== itemId));
}
export function moveMenuItem(site: EditorSite, sectionId: string, elementId: string, itemId: string, delta: number): EditorSite {
  return mapItems(site, sectionId, elementId, items => {
    const index = items.findIndex(i => i.id === itemId), target = index + delta;
    if (index < 0 || target < 0 || target >= items.length) return items;
    const [item] = items.splice(index, 1);
    items.splice(target, 0, item);
    return items;
  });
}

// ---------------------------------------------------------------- section content
export type DataPath = (string | number)[];
const isObj = (v: unknown): v is Record<string, Json> => !!v && typeof v === "object" && !Array.isArray(v);

/** Sets one value inside a section's `data`. Every step of the path must already
 *  exist (except the final key on an object), so edits cannot create odd shapes. */
export function setSectionField(site: EditorSite, sectionId: string, path: DataPath, value: Json): EditorSite {
  if (!path.length) throw new Error("Nothing to change.");
  return mapSection(site, sectionId, section => {
    let node: Json = section.data;
    for (const step of path.slice(0, -1)) {
      if (Array.isArray(node) && typeof step === "number" && step >= 0 && step < node.length) node = node[step];
      else if (isObj(node) && typeof step === "string" && step in node) node = node[step];
      else throw new Error("This item no longer exists.");
    }
    const last = path[path.length - 1];
    if (Array.isArray(node) && typeof last === "number" && last >= 0 && last < node.length) node[last] = value;
    else if (isObj(node) && typeof last === "string" && !/^(__proto__|constructor|prototype)$/.test(last)) node[last] = value;
    else throw new Error("This item no longer exists.");
    return section;
  });
}

function mapList(site: EditorSite, sectionId: string, key: string, fn: (list: Json[]) => Json[]): EditorSite {
  return mapSection(site, sectionId, section => {
    const current = section.data[key];
    if (current !== undefined && !Array.isArray(current)) throw new Error("This list cannot be edited.");
    return { ...section, data: { ...section.data, [key]: fn([...(current ?? [])]) } };
  });
}
export function addListItem(site: EditorSite, sectionId: string, key: string, item: Record<string, Json>, max = 50): EditorSite {
  return mapList(site, sectionId, key, list => (list.length >= max ? list : [...list, structuredClone(item)]));
}
export function removeListItem(site: EditorSite, sectionId: string, key: string, index: number): EditorSite {
  return mapList(site, sectionId, key, list => list.filter((_, i) => i !== index));
}
export function moveListItem(site: EditorSite, sectionId: string, key: string, index: number, delta: number): EditorSite {
  return mapList(site, sectionId, key, list => {
    const target = index + delta;
    if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list;
    const [item] = list.splice(index, 1);
    list.splice(target, 0, item);
    return list;
  });
}

// ---------------------------------------------------------------- pages
export type EditorPage = NonNullable<EditorSite["pages"]>[number];

/** A copy of a section with new IDs everywhere, safe to place on another page. */
export function freshCopy(section: Section): Section {
  const copy = structuredClone(section);
  copy.id = newId("comp");
  const elements = getElements(copy);
  if (elements) {
    return withElements(copy, elements.map(e => ({
      ...e, id: newId(), ...(e.items ? { items: e.items.map(i => ({ ...i, id: newId("item") })) } : {}),
    })));
  }
  return copy;
}

export function slugify(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "page";
}
function uniqueSlug(pages: EditorPage[], base: string, exceptId?: string) {
  let slug = base, n = 2;
  while (pages.some(p => p.id !== exceptId && (p.slug || "").replace(/^\/+|\/+$/g, "") === slug)) slug = `${base}-${n++}`;
  return slug;
}

/** Single-page sites get a page list (with the current sections as Home) on first use. */
export function ensurePages(site: EditorSite): EditorSite {
  if (site.pages?.length && site.active_page_id && site.pages.some(p => p.id === site.active_page_id)) return site;
  if (site.pages?.length) return { ...site, active_page_id: (site.pages.find(p => p.is_home) ?? site.pages[0]).id };
  return { ...site, pages: [{ id: "page_home", name: "Home", slug: "", is_home: true, schema_json: site.schema_json }], active_page_id: "page_home" };
}

/** Stores the open page's sections back into its page entry. */
function storeActive(site: EditorSite): EditorPage[] {
  return (site.pages ?? []).map(p => (p.id === site.active_page_id ? { ...p, schema_json: site.schema_json } : p));
}

export function switchPage(site: EditorSite, pageId: string): EditorSite {
  const ready = ensurePages(site);
  if (ready.active_page_id === pageId) return ready;
  const pages = storeActive(ready);
  const target = pages.find(p => p.id === pageId);
  if (!target) throw new Error("This page no longer exists.");
  const sections = readDocument(Array.isArray(target.schema_json) ? target.schema_json : []).sections;
  const ctx = { sections, pages, siteSlug: site.slug };
  return { ...ready, pages, active_page_id: pageId, schema_json: sections.map(s => upgradeSection(s, ctx)) };
}

/** Adds a page and opens it. It starts with copies of this page's navigation bar and footer. */
export function addPage(site: EditorSite, name: string): EditorSite {
  const ready = ensurePages(site);
  const pages = storeActive(ready);
  if (pages.length >= 30) throw new Error("A website can have up to 30 pages.");
  const clean = name.trim().slice(0, 60) || "New page";
  const id = newId("page");
  const shared = ready.schema_json.filter(s => s.type === "navbar" || s.type === "footer").map(freshCopy);
  const page: EditorPage = { id, name: clean, slug: uniqueSlug(pages, slugify(clean)), is_home: false, schema_json: shared };
  return { ...ready, pages: [...pages, page], active_page_id: id, schema_json: shared };
}

export function renamePage(site: EditorSite, pageId: string, name: string, slug?: string): EditorSite {
  const ready = ensurePages(site);
  const pages = storeActive(ready);
  const page = pages.find(p => p.id === pageId);
  if (!page) throw new Error("This page no longer exists.");
  const clean = name.trim().slice(0, 60);
  if (!clean) throw new Error("Give the page a name.");
  const nextSlug = page.is_home ? "" : uniqueSlug(pages, slugify(slug ?? clean), pageId);
  return { ...ready, pages: pages.map(p => (p.id === pageId ? { ...p, name: clean, slug: nextSlug } : p)) };
}

export function removePage(site: EditorSite, pageId: string): EditorSite {
  const ready = ensurePages(site);
  const page = ready.pages!.find(p => p.id === pageId);
  if (!page) return ready;
  if (page.is_home) throw new Error("The home page can’t be deleted.");
  const opened = ready.active_page_id === pageId ? switchPage(ready, ready.pages!.find(p => p.is_home)!.id) : ready;
  return { ...opened, pages: storeActive(opened).filter(p => p.id !== pageId) };
}

/** Content fingerprint of every page, ignoring which page is open. */
export function contentSignature(site: EditorSite): string {
  const ready = ensurePages(site);
  return JSON.stringify({ sections: ready.pages ? null : site.schema_json, pages: storeActive(ready).map(p => [p.id, p.name, p.slug, p.schema_json]) });
}

export function movePage(site: EditorSite, pageId: string, delta: number): EditorSite {
  const ready = ensurePages(site);
  const pages = storeActive(ready);
  const index = pages.findIndex(p => p.id === pageId), target = index + delta;
  if (index < 0 || target < 0 || target >= pages.length) return ready;
  const [page] = pages.splice(index, 1);
  pages.splice(target, 0, page);
  return { ...ready, pages };
}

// ---------------------------------------------------------------- saving
export function editorPayload(site: EditorSite) {
  const ctx = linkContext(site);
  const sections = readDocument(site.schema_json.map(s => syncLegacy(s, ctx))).sections;
  const payload: { schema_json: Section[]; pages?: EditorSite["pages"]; active_page_id?: string } = { schema_json: sections };
  if (site.pages?.length) {
    if (!site.active_page_id || !site.pages.some(p => p.id === site.active_page_id)) {
      throw new Error("This website's current page could not be found. Reload the editor and try again.");
    }
    // Every page's navbar/hero text is written back for the current publisher, not just the open page.
    payload.pages = site.pages.map(p => {
      if (p.id === site.active_page_id) return { ...p, schema_json: sections };
      const own = Array.isArray(p.schema_json) ? p.schema_json : [];
      const pageCtx = { ...ctx, sections: own };
      return { ...structuredClone(p), schema_json: own.map(s => syncLegacy(structuredClone(s), pageCtx)) };
    });
    payload.active_page_id = site.active_page_id;
  }
  return payload;
}
