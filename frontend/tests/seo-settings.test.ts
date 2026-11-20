import { test } from "node:test";
import assert from "node:assert/strict";
import { readSeo, searchSnippet, seoPayload, seoProblems } from "../src/features/studio/seo-settings";

const site = { name: "AI & ML 2027", meta_title: "Old title", meta_config: { custom_head_code: "<meta keep>", robots: "noindex, nofollow", ga_tracking_id: "G-OLD12345" } };

test("reads saved settings with older top-level fallbacks", () => {
  const s = readSeo(site);
  assert.equal(s.meta_title, "Old title");
  assert.equal(s.indexable, false);
  assert.equal(s.ga_tracking_id, "G-OLD12345");
});

test("saving merges into meta_config and keeps settings this screen does not show", () => {
  const payload = seoPayload(site, { ...readSeo(site), meta_title: " New ", indexable: true, ga_tracking_id: "g-ab12cd34ef" });
  assert.equal(payload.meta_config.custom_head_code, "<meta keep>");
  assert.equal(payload.meta_config.meta_title, "New");
  assert.equal(payload.meta_config.robots, "index, follow");
  assert.equal(payload.meta_config.ga_tracking_id, "G-AB12CD34EF");
});

test("invalid values are explained in plain language", () => {
  const base = readSeo({ name: "x" });
  assert.deepEqual(seoProblems(base), {});
  const p = seoProblems({ ...base, ga_tracking_id: "<script>", og_image: "javascript:x", canonical_url: "aiml.org", meta_title: "x".repeat(200) });
  assert.match(p.ga_tracking_id ?? "", /Google Analytics ID/);
  assert.ok(p.og_image && p.canonical_url && p.meta_title);
  assert.deepEqual(seoProblems({ ...base, ga_tracking_id: "G-AB12CD34EF", canonical_url: "https://www.aiml2027.org" }), {});
});

test("search preview falls back to the site name and cuts long text", () => {
  const snip = searchSnippet({ ...readSeo({ name: "x" }), meta_description: "d".repeat(300) }, "AI & ML 2027");
  assert.equal(snip.title, "AI & ML 2027");
  assert.ok(snip.description.length <= 160 && snip.description.endsWith("…"));
});
