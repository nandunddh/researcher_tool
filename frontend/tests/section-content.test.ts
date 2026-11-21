import { test } from "node:test";
import assert from "node:assert/strict";
import { addListItem, moveListItem, removeListItem, setSectionField, setSectionStyle, type EditorSite } from "../src/features/studio/editor-model";
import { cleanFieldValue, sectionRegistry } from "../src/features/studio/section-registry";
import { buildSiteCss, getSectionStyle } from "../src/features/studio/site-schema";

const site: EditorSite = {
  site_id: "s", name: "T",
  schema_json: [{ id: "spk", type: "speakers", data: { section_title: "Faculty", speakers: [{ name: "A", extra: { keep: true } }, { name: "B" }] } }],
};
const speakers = (s: EditorSite) => s.schema_json[0].data.speakers as Record<string, unknown>[];

test("every content section type has an editor description", () => {
  for (const type of ["features", "speakers", "pricing", "gallery", "faq", "contact", "footer", "about", "stats", "agenda", "sponsors", "testimonials", "announcement", "image", "custom", "content"]) {
    assert.ok(sectionRegistry[type], type);
  }
});

test("fields change one value and keep everything else", () => {
  const next = setSectionField(site, "spk", ["speakers", 0, "name"], "Dr. Ada");
  assert.equal(speakers(next)[0].name, "Dr. Ada");
  assert.deepEqual(speakers(next)[0].extra, { keep: true });
  assert.equal(speakers(site)[0].name, "A", "history not mutated");
  assert.throws(() => setSectionField(site, "spk", ["speakers", 9, "name"], "x"), /no longer exists/);
  assert.throws(() => setSectionField(site, "spk", ["__proto__"], "x"));
});

test("list items can be added, moved and removed", () => {
  let next = addListItem(site, "spk", "speakers", { name: "C" });
  next = moveListItem(next, "spk", "speakers", 2, -2);
  assert.deepEqual(speakers(next).map(s => s.name), ["C", "A", "B"]);
  assert.deepEqual(speakers(removeListItem(next, "spk", "speakers", 0)).map(s => s.name), ["A", "B"]);
  assert.equal(speakers(addListItem(site, "spk", "speakers", { name: "D" }, 2)).length, 2, "max respected");
});

test("field values are checked before they are stored", () => {
  assert.equal(cleanFieldValue("image", "javascript:alert(1)"), undefined);
  assert.equal(cleanFieldValue("link", "javascript:alert(1)"), undefined);
  assert.equal(cleanFieldValue("link", ""), "#");
  assert.deepEqual(cleanFieldValue("lines", "One\nTwo"), ["One", "Two"]);
  assert.equal(cleanFieldValue("number", "99999", { key: "h", label: "H", kind: "number", min: 100, max: 2000 }), 2000);
  assert.equal(cleanFieldValue("toggle", "yes"), undefined);
});

test("section gradients are cleaned and written as CSS", () => {
  const next = setSectionStyle(site, "spk", "desktop", { gradient: { from: "#112233", to: "#445566", angle: 45 } });
  assert.deepEqual(getSectionStyle(next.schema_json[0]).desktop.gradient, { from: "#112233", to: "#445566", angle: 45 });
  assert.match(buildSiteCss(next.schema_json), /background:linear-gradient\(45deg,#112233,#445566\)/);
  const bad = setSectionStyle(site, "spk", "desktop", { gradient: { from: "red;}", to: "#445566", angle: 45 } });
  assert.equal(getSectionStyle(bad.schema_json[0]).desktop.gradient, undefined);
});

test("quick toolbar styles: font, italic and underline are cleaned and written as CSS", async () => {
  const { cleanStyle } = await import("../src/features/studio/site-schema");
  assert.deepEqual(cleanStyle({ fontFamily: "classic", italic: true, underline: true }), { fontFamily: "classic", italic: true, underline: true });
  assert.deepEqual(cleanStyle({ fontFamily: "Comic Sans; color:red", italic: "yes" }), {});
  const css = buildSiteCss([{ id: "h", type: "hero", data: {}, canvas_elements: [{ id: "e1", kind: "heading", slot: "content", style: { desktop: { fontFamily: "classic", italic: true } } }] } as never]);
  assert.match(css, /font-family:Georgia/);
  assert.match(css, /font-style:italic/);
});

test("duplicate places a copy with new ids right below", async () => {
  const { duplicateSection } = await import("../src/features/studio/editor-model");
  const next = duplicateSection(site, "spk");
  assert.equal(next.schema_json.length, 2);
  assert.notEqual(next.schema_json[1].id, "spk");
  assert.deepEqual(next.schema_json[1].data, site.schema_json[0].data);
});

test("individual texts in content sections can be styled per screen size", async () => {
  const { setTextStyle } = await import("../src/features/studio/editor-model");
  const next = setTextStyle(site, "spk", "speakers.0.name", "mobile", { fontSize: 22, color: "#112233" });
  const css = buildSiteCss(next.schema_json);
  assert.match(css, /@container sci-site \(max-width: 640px\)\{\[data-section="spk"\] \[data-tp="speakers\.0\.name"\]\{color:#112233;font-size:22px\}\}/);
  assert.throws(() => setTextStyle(site, "spk", 'x"]{}*{', "desktop", { color: "#000000" }));
});

test("text styles stay on their item when items move or are deleted", async () => {
  const m = await import("../src/features/studio/editor-model");
  const { getTextStyles } = await import("../src/features/studio/site-schema");
  let s = m.addListItem(site, "spk", "speakers", { name: "C" });
  s = m.setTextStyle(s, "spk", "speakers.0.name", "desktop", { color: "#ff0000" });
  s = m.moveListItem(s, "spk", "speakers", 0, 2);
  assert.deepEqual(Object.keys(getTextStyles(s.schema_json[0])), ["speakers.2.name"]);
  s = m.removeListItem(s, "spk", "speakers", 0);
  assert.deepEqual(Object.keys(getTextStyles(s.schema_json[0])), ["speakers.1.name"]);
  s = m.removeListItem(s, "spk", "speakers", 1);
  assert.deepEqual(getTextStyles(s.schema_json[0]), {}, "deleted item's styles removed");
});
