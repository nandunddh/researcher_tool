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
