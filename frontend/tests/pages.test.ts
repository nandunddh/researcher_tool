import { test } from "node:test";
import assert from "node:assert/strict";
import { addPage, contentSignature, editorPayload, ensurePages, movePage, prepareSite, removePage, renamePage, switchPage, type EditorSite } from "../src/features/studio/editor-model";
import { getElements, linkHref } from "../src/features/studio/site-schema";

const base = prepareSite({
  site_id: "s", name: "AI", slug: "ai",
  schema_json: [
    { id: "nav", type: "navbar", data: { brand_name: "AI", links: [{ label: "Home", url: "#" }] } },
    { id: "hero", type: "hero", data: { headline: "Welcome" } },
    { id: "foot", type: "footer", data: { brand_name: "AI", links: [] } },
  ],
});

test("single-page sites get a Home page on first use", () => {
  const s = ensurePages(base);
  assert.equal(s.pages?.length, 1);
  assert.equal(s.pages?.[0].is_home, true);
  assert.equal(s.active_page_id, "page_home");
});

test("a new page opens with fresh copies of the navigation bar and footer", () => {
  const s = addPage(base, "Call for Papers");
  assert.equal(s.pages?.length, 2);
  const page = s.pages!.find(p => p.id === s.active_page_id)!;
  assert.equal(page.slug, "call-for-papers");
  assert.deepEqual(s.schema_json.map(x => x.type), ["navbar", "footer"]);
  assert.notEqual(s.schema_json[0].id, "nav", "copies get new ids");
  assert.notEqual(getElements(s.schema_json[0])![0].id, getElements(base.schema_json[0])![0].id);
  assert.equal(s.pages!.find(p => p.is_home)!.schema_json!.length, 3, "home page kept");
});

test("switching pages keeps each page's sections", () => {
  let s = addPage(base, "Program");
  s = switchPage(s, "page_home");
  assert.deepEqual(s.schema_json.map(x => x.id), ["nav", "hero", "foot"]);
  const program = s.pages!.find(p => p.name === "Program")!;
  s = switchPage(s, program.id);
  assert.deepEqual(s.schema_json.map(x => x.type), ["navbar", "footer"]);
  assert.throws(() => switchPage(s, "missing"));
});

test("rename keeps addresses unique; home cannot be deleted; delete reopens home", () => {
  let s = addPage(addPage(base, "Program"), "Speakers");
  const speakers = s.active_page_id!;
  s = renamePage(s, speakers, "Program 2", "program");
  assert.equal(s.pages!.find(p => p.id === speakers)!.slug, "program-2");
  assert.throws(() => removePage(s, "page_home"));
  s = removePage(s, speakers);
  assert.equal(s.active_page_id, "page_home");
  assert.equal(s.pages!.length, 2);
  assert.equal(movePage(s, "page_home", -1).pages![0].id, "page_home");
});

test("saving includes every page; switching alone is not a content change", () => {
  const s = addPage(base, "Venue");
  const payload = editorPayload(s);
  assert.equal(payload.pages?.length, 2);
  assert.equal(payload.active_page_id, s.active_page_id);
  const back = switchPage(s, "page_home");
  assert.equal(contentSignature(back), contentSignature(s));
});

test("page links resolve to the published address or a custom path", () => {
  const s = addPage(base, "Venue");
  const ctx = { sections: s.schema_json, pages: s.pages, siteSlug: "ai" };
  const venue = s.pages!.find(p => p.name === "Venue")!;
  assert.equal(linkHref({ type: "page", pageId: venue.id }, ctx), "/sites/ai/venue");
  assert.equal(linkHref({ type: "page", pageId: "page_home" }, ctx), "/sites/ai");
  assert.equal(linkHref({ type: "page", pageId: venue.id }, { ...ctx, pagePath: p => `/preview?page=${p.slug}` }), "/preview?page=venue");
});
