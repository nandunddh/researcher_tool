import { test } from "node:test";
import assert from "node:assert/strict";
import { componentCatalog } from "../src/features/studio/component-catalog";
import { instantiateComponent } from "../src/features/studio/component-instance";
import { groupByField } from "../src/features/studio/grouping";
import { sectionRegistry } from "../src/features/studio/section-registry";

const make = (id: string) => instantiateComponent(componentCatalog.find(c => c.id === id)!, "Summit 2027");

test("speaker layouts are selectable and every speaker has a talk title field", () => {
  const def = sectionRegistry.speakers;
  const layout = def.fields.find(f => f.key === "design")!;
  assert.deepEqual((layout.options ?? []).map(([value]) => value), ["cards", "list", "portraits"]);
  assert.ok(def.lists[0].fields.some(f => f.key === "talk"));
  assert.deepEqual(Object.keys(def.lists[0].newItem()).sort(), def.lists[0].fields.map(f => f.key).sort(), "a new speaker has every field");
});

test("speaker and committee entries start in the layout their name promises", () => {
  const options = new Set((sectionRegistry.speakers.fields[0].options ?? []).map(([value]) => value));
  for (const [id, design, title] of [["speakers-list", "list", "Invited speakers"], ["speakers-portraits", "portraits", "Invited speakers"], ["committee-list", "list", "Organising committee"]]) {
    const instance = make(id);
    assert.equal(instance.type, "speakers", id);
    assert.equal(instance.data.design, design, id);
    assert.ok(options.has(String(instance.data.design)), `${id}: a layout the panel offers`);
    assert.equal(instance.data.section_title, title);
    const people = instance.data.speakers as Record<string, string>[];
    assert.ok(people.length >= 3 && people.every(p => p.name && p.role && "talk" in p && "bio" in p && "photo" in p), id);
  }
  assert.ok(make("committee-list").data.speakers && (make("committee-list").data.speakers as { role: string }[])[0].role === "Chair");
});

test("the column footer has columns and the simple footer does not", () => {
  const def = sectionRegistry.footer;
  assert.deepEqual((def.fields.find(f => f.key === "design")!.options ?? []).map(([value]) => value), ["simple", "columns"]);
  assert.deepEqual(def.lists.map(l => l.key), ["links", "social"]);
  assert.ok(def.lists[0].fields.some(f => f.key === "group"));
  for (const list of def.lists) assert.deepEqual(Object.keys(list.newItem()).sort(), list.fields.map(f => f.key).sort(), `${list.key}: a new item has every field`);

  const columns = make("footer-columns").data as { design: string; links: Record<string, string>[]; social: unknown[]; copyright: string; tagline: string };
  assert.equal(columns.design, "columns");
  assert.deepEqual(groupByField(columns.links, "group").map(g => g.label), ["Event", "Information"]);
  assert.ok(columns.links.every(l => l.label && l.url.startsWith("#")));
  assert.deepEqual(columns.social, [], "no made-up social links");
  assert.match(columns.copyright, new RegExp(`© ${new Date().getFullYear()} Summit 2027`), "the copyright names the real brand and year");
  assert.equal(columns.tagline, "", "no placeholder sentence is published");

  const simple = make("footer-simple").data as { design: string; links: Record<string, string>[] };
  assert.equal(simple.design, "simple");
  assert.deepEqual(groupByField(simple.links, "group").map(g => g.label), [""], "one row, no headings");
});
