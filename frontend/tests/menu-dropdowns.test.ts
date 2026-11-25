import { test } from "node:test";
import assert from "node:assert/strict";
import { addMenuItem, editorPayload, moveMenuItem, prepareSite, removeMenuItem, updateMenuItem, type EditorSite } from "../src/features/studio/editor-model";
import { cleanElements, getElements, MAX_SUB_ITEMS, type MenuItem } from "../src/features/studio/site-schema";

const raw: EditorSite = {
  site_id: "s", name: "Test", slug: "summit",
  schema_json: [
    { id: "nav", type: "navbar", data: { brand_name: "Summit", cta_label: "Register", cta_link: "#pricing", links: [
      { label: "Home", url: "#" },
      { label: "Program", url: "#schedule", children: [{ label: "Schedule", url: "#schedule" }, { label: "Speakers", url: "#speakers", target: "_blank" }] },
    ] } },
    { id: "schedule", type: "schedule", data: { sessions: [] } },
  ],
};
const site = prepareSite(raw);
const menu = (s: EditorSite) => getElements(s.schema_json[0])!.find(e => e.kind === "menu")!;
const items = (s: EditorSite): MenuItem[] => menu(s).items ?? [];
const program = (s: EditorSite) => items(s).find(i => i.label === "Program")!;

test("saved sub-links load into the editor and save back unchanged", () => {
  assert.deepEqual(program(site).children!.map(c => c.label), ["Schedule", "Speakers"]);
  assert.equal(program(site).children![0].link?.type, "section", "a link to a section on the page stays a section link");
  assert.deepEqual(program(site).children![1].link, { type: "url", href: "#speakers", newTab: true });
  const links = editorPayload(site).schema_json[0].data.links as { label: string; children?: { label: string; target?: string }[] }[];
  assert.deepEqual(links.map(l => l.label), ["Home", "Program"]);
  assert.deepEqual(links[1].children!.map(c => c.label), ["Schedule", "Speakers"]);
  assert.equal(links[1].children![1].target, "_blank");
  assert.equal(links[0].children, undefined, "plain links stay plain");
  assert.deepEqual(prepareSite(editorPayload(site)).schema_json[0].data.links, links, "loading the saved site again changes nothing");
});

test("sub-links can be added, edited, moved and removed without touching other links", () => {
  const el = menu(site).id;
  let next = addMenuItem(site, "nav", el, program(site).id);
  assert.deepEqual(program(next).children!.map(c => c.label), ["Schedule", "Speakers", "New sub-link"]);
  const added = program(next).children![2];
  next = updateMenuItem(next, "nav", el, added.id, { label: "Venue", link: { type: "url", href: "#venue" } });
  assert.equal(program(next).children![2].label, "Venue");
  next = moveMenuItem(next, "nav", el, added.id, -2);
  assert.deepEqual(program(next).children!.map(c => c.label), ["Venue", "Schedule", "Speakers"]);
  assert.deepEqual(moveMenuItem(next, "nav", el, added.id, -1), next, "cannot move past the start");
  next = removeMenuItem(next, "nav", el, added.id);
  assert.deepEqual(program(next).children!.map(c => c.label), ["Schedule", "Speakers"]);
  assert.deepEqual(items(next).map(i => i.label), ["Home", "Program"], "top-level links untouched");
  assert.deepEqual(items(site).map(i => i.children?.length ?? 0), [0, 2], "the original is not changed");
});

test("removing the last sub-link turns the link back into a plain link", () => {
  const el = menu(site).id;
  let next = site;
  for (const child of program(site).children!) next = removeMenuItem(next, "nav", el, child.id);
  assert.equal(program(next).children, undefined);
});

test("top-level links still work as before", () => {
  const el = menu(site).id;
  const next = addMenuItem(site, "nav", el);
  assert.deepEqual(items(next).map(i => i.label), ["Home", "Program", "New link"]);
  const moved = moveMenuItem(next, "nav", el, program(next).id, 1);
  assert.deepEqual(items(moved).map(i => i.label), ["Home", "New link", "Program"]);
  assert.deepEqual(program(moved).children!.map(c => c.label), ["Schedule", "Speakers"], "sub-links move with their link");
});

test("limits: one level only, a capped number of sub-links, and no sub-links under a missing link", () => {
  const deep = cleanElements([{ id: "m1", kind: "menu", slot: "links", items: [
    { id: "a", label: "A", children: [{ id: "b", label: "B", children: [{ id: "c", label: "C" }] }] },
    { id: "many", label: "Many", children: Array.from({ length: MAX_SUB_ITEMS + 5 }, (_, i) => ({ id: `s${i}`, label: `S${i}` })) },
    { id: "bad", label: "Bad", children: "nope" },
  ] }])[0].items!;
  assert.equal(deep[0].children![0].children, undefined, "sub-links of sub-links are dropped");
  assert.equal(deep[1].children!.length, MAX_SUB_ITEMS);
  assert.equal(deep[2].children, undefined);

  const el = menu(site).id;
  let full = site;
  for (let i = program(site).children!.length; i < MAX_SUB_ITEMS + 3; i++) full = addMenuItem(full, "nav", el, program(site).id);
  assert.equal(program(full).children!.length, MAX_SUB_ITEMS);
  assert.throws(() => addMenuItem(site, "nav", el, "item_missing"), /no longer exists/);
});
