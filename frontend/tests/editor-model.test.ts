import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addMenuItem, dropSection, editorPayload, insertSection, moveMenuItem, moveSection, prepareSite, removeMenuItem,
  resetElementStyle, setElementStyle, setLayout, setSectionStyle, updateElement, updateMenuItem, type EditorSite,
} from "../src/features/studio/editor-model";
import { getElements, getSectionStyle } from "../src/features/studio/site-schema";

const raw: EditorSite = {
  site_id: "s", name: "Test", slug: "ai-ml-2027",
  schema_json: [
    { id: "nav", type: "navbar", data: { brand_name: "AI & ML 2027", links: [{ label: "Speakers", url: "#speakers", target: "_blank", icon: "mic" }], cta_label: "Register", cta_link: "#pricing" } },
    { id: "hero", type: "hero", data: { headline: "Old", unknown: { keep: true } }, field_formats: { x: "keep" } },
    { id: "legacy", type: "speakers", data: { html: "preserve" } },
  ],
  active_page_id: "home",
  pages: [{ id: "home", name: "Home", is_home: true, schema_json: [] }, { id: "cfp", name: "Call for papers", slug: "cfp", schema_json: [{ id: "x", type: "custom", data: { html: "keep" } }] }],
};
const site = prepareSite(raw);
const els = (s: EditorSite, id: string) => getElements(s.schema_json.find(x => x.id === id)!)!;
const role = (s: EditorSite, id: string, r: string) => els(s, id).find(e => e.role === r)!;

test("loading adds elements to navbar and hero only, keeping everything else", () => {
  assert.equal(els(site, "nav").length, 3);
  assert.equal(els(site, "hero").length, 6);
  assert.deepEqual(site.schema_json[2], raw.schema_json[2]);
  assert.deepEqual(site.schema_json[1].field_formats, { x: "keep" });
  assert.equal(raw.schema_json[0].elements, undefined, "input not mutated");
  assert.deepEqual(prepareSite(site).schema_json, site.schema_json, "loading twice is stable");
});

test("editing text changes one element and is saved into the legacy fields", () => {
  const headline = role(site, "hero", "headline");
  const next = updateElement(site, "hero", headline.id, { text: "AI & ML 2027" });
  assert.equal(role(site, "hero", "headline").text, "Old");
  const payload = editorPayload(next);
  assert.equal(payload.schema_json[1].data.headline, "AI & ML 2027");
  assert.deepEqual(payload.schema_json[1].data.unknown, { keep: true });
  assert.deepEqual(payload.pages?.[0].schema_json, payload.schema_json);
  assert.deepEqual(payload.pages?.[1], raw.pages?.[1]);
  assert.equal("site_id" in payload, false);
});

test("links are structured, validated and written back as hrefs", () => {
  const cta = role(site, "nav", "cta");
  assert.throws(() => updateElement(site, "nav", cta.id, { link: { type: "url", href: "javascript:alert(1)" } }));
  const toPage = updateElement(site, "nav", cta.id, { link: { type: "page", pageId: "cfp" } });
  assert.equal(editorPayload(toPage).schema_json[0].data.cta_link, "/sites/ai-ml-2027/cfp");
  const toSection = updateElement(site, "nav", cta.id, { link: { type: "section", sectionId: "legacy" } });
  assert.equal(editorPayload(toSection).schema_json[0].data.cta_link, "#speakers");
  const none = updateElement(site, "nav", cta.id, { link: null });
  assert.equal(editorPayload(none).schema_json[0].data.cta_link, "#");
});

test("logo can switch to an image; unsafe image links are refused", () => {
  const logo = role(site, "nav", "logo");
  assert.throws(() => updateElement(site, "nav", logo.id, { src: "javascript:x" }));
  assert.throws(() => updateElement(site, "nav", logo.id, { mode: "script" as never }));
  const next = updateElement(updateElement(site, "nav", logo.id, { src: "/api/builder/media/site_1234abcd/a.png" }), "nav", logo.id, { mode: "image" });
  const data = editorPayload(next).schema_json[0].data;
  assert.equal(data.brand_mode, "image");
  assert.equal(data.logo_url, "/api/builder/media/site_1234abcd/a.png");
});

test("menu items: add, edit, reorder, remove; extra link metadata survives", () => {
  const menu = role(site, "nav", "menu");
  let next = addMenuItem(site, "nav", menu.id);
  const added = role(next, "nav", "menu").items![1];
  next = updateMenuItem(next, "nav", menu.id, added.id, { label: "Program", link: { type: "url", href: "https://example.com" } });
  next = moveMenuItem(next, "nav", menu.id, added.id, -1);
  const links = editorPayload(next).schema_json[0].data.links as Record<string, unknown>[];
  assert.deepEqual(links.map(l => l.label), ["Program", "Speakers"]);
  assert.deepEqual(links[1], { label: "Speakers", url: "#speakers", target: "_blank", icon: "mic" });
  const removed = removeMenuItem(next, "nav", menu.id, added.id);
  assert.equal(role(removed, "nav", "menu").items!.length, 1);
});

test("styles are per screen size, cleaned, and resettable", () => {
  const h = role(site, "hero", "headline");
  let next = setElementStyle(site, "hero", h.id, "desktop", { fontSize: 64, color: "#112233" });
  next = setElementStyle(next, "hero", h.id, "mobile", { fontSize: 32, color: "red;}body{display:none" });
  const style = role(next, "hero", "headline").style;
  assert.deepEqual(style.desktop, { fontSize: 64, color: "#112233" });
  assert.deepEqual(style.mobile, { fontSize: 32 }, "unsafe colour dropped");
  next = setElementStyle(next, "hero", h.id, "desktop", { color: null });
  assert.deepEqual(role(next, "hero", "headline").style.desktop, { fontSize: 64 });
  assert.equal(role(resetElementStyle(next, "hero", h.id, "mobile"), "hero", "headline").style.mobile, undefined);
  const bg = setSectionStyle(site, "hero", "desktop", { background: "#000000", paddingY: 9999 });
  assert.deepEqual(getSectionStyle(bg.schema_json[1]).desktop, { background: "#000000", paddingY: 400 });
});

test("layouts, reordering and drops never mutate history", () => {
  assert.equal(setLayout(site, "hero", "split"), site);
  assert.equal(setLayout(site, "hero", "image_left").schema_json[1].data.layout_variant, "image_left");
  assert.throws(() => setLayout(site, "hero", "editorial"));
  const moved = moveSection(site, "legacy", -1);
  assert.deepEqual(moved.schema_json.map(s => s.id), ["nav", "legacy", "hero"]);
  assert.equal(site.schema_json[2].id, "legacy");
  assert.equal(moveSection(site, "nav", -1), site);
  assert.equal(dropSection(site, "external", "hero"), site);
  assert.deepEqual(dropSection(site, "legacy", "nav").schema_json.map(s => s.id), ["legacy", "nav", "hero"]);
});

test("insertion upgrades new sections, follows selection and rejects duplicate IDs", () => {
  const section = { id: "new", type: "hero", data: { headline: "New" } };
  const next = insertSection(site, section, "nav");
  assert.deepEqual(next.schema_json.map(s => s.id), ["nav", "new", "hero", "legacy"]);
  assert.equal(role(next, "new", "headline").text, "New");
  section.data.headline = "Changed";
  assert.equal(role(next, "new", "headline").text, "New");
  assert.throws(() => insertSection(site, site.schema_json[0]));
});

test("missing items and ambiguous page saves are reported", () => {
  assert.throws(() => updateElement(site, "hero", "el_missing", { text: "x" }), /no longer exists/);
  assert.throws(() => updateElement(site, "gone", "el", { text: "x" }), /no longer exists/);
  assert.throws(() => editorPayload({ ...site, active_page_id: undefined }));
});
