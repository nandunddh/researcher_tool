import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSiteCss, cleanElements, cleanLink, getElements, hrefToLink, linkHref, needsKeyMigration, resolveStyle, safeImage, safeUrl, upgradeSection,
  type Responsive, type Style,
} from "../src/features/studio/site-schema";
import type { Section } from "../src/features/studio/document";

test("only safe link targets are accepted", () => {
  for (const ok of ["https://example.com", "http://a.b/c?d=1", "mailto:a@b.co", "tel:+15550100", "#speakers", "/sites/x"]) assert.equal(safeUrl(ok), ok);
  for (const bad of ["javascript:alert(1)", " JaVaScRiPt:x", "data:text/html,x", "//evil.com", "#a b", "https://x\"onmouseover=1", "vbscript:x", ""]) assert.equal(safeUrl(bad), undefined, bad);
  assert.equal(safeImage("data:image/svg+xml;base64,AAAA"), undefined, "SVG data URLs are not images we allow");
  assert.equal(safeImage("/api/builder/media/site_1234abcd/x.png"), "/api/builder/media/site_1234abcd/x.png");
});

test("links are validated by type", () => {
  assert.deepEqual(cleanLink({ type: "email", address: " team@aiml2027.org " }), { type: "email", address: "team@aiml2027.org" });
  assert.equal(cleanLink({ type: "email", address: "not-an-email" }), undefined);
  assert.equal(cleanLink({ type: "page", pageId: "../x" }), undefined);
  assert.equal(cleanLink({ type: "other" }), undefined);
  const ctx = { sections: [{ id: "s1", type: "faq", data: {} }] };
  assert.deepEqual(hrefToLink("#faq", ctx), { type: "section", sectionId: "s1" });
  assert.deepEqual(hrefToLink("mailto:a@b.co", ctx), { type: "email", address: "a@b.co" });
  assert.equal(hrefToLink("#", ctx), undefined);
  assert.equal(linkHref({ type: "phone", number: "+1 (555) 010-0" }, ctx), "tel:+15550100");
  assert.equal(linkHref({ type: "page", pageId: "missing" }, ctx), "#");
});

test("stored elements are cleaned: bad kinds dropped, duplicate IDs replaced, unsafe values removed", () => {
  const els = cleanElements([
    { id: "a", kind: "heading", slot: "content", text: "Hi", style: { desktop: { color: "url(x)", fontSize: 9999 } } },
    { id: "a", kind: "button", slot: "actions", link: { type: "url", href: "javascript:x" }, style: {} },
    { id: "b", kind: "script", slot: "x" },
    "nonsense",
  ]);
  assert.equal(els.length, 2);
  assert.notEqual(els[0].id, els[1].id);
  assert.deepEqual(els[0].style.desktop, { fontSize: 160 });
  assert.equal(els[1].link, undefined);
});

test("generated CSS contains only sanitized values and uses container breakpoints", () => {
  const section = {
    id: "hero", type: "hero", data: {},
    section_style: { desktop: { background: "#ffffff" }, mobile: { paddingY: 20 } },
    canvas_elements: [
      { id: "h1", kind: "heading", slot: "content", style: { desktop: { color: "#123456" }, tablet: { fontSize: 40 }, mobile: { color: "red}body{x" } } },
      { id: "bad\"]{}*{", kind: "text", slot: "content", style: { desktop: { color: "#000" } } },
    ],
  };
  const css = buildSiteCss([section as unknown as Section]);
  assert.match(css, /\[data-section="hero"\]\{background:#ffffff\}/);
  assert.match(css, /\[data-el="h1"\]\{color:#123456\}/);
  assert.match(css, /@container sci-site \(max-width: 1023px\)\{\[data-el="h1"\]\{font-size:40px\}\}/);
  assert.doesNotMatch(css, /body|red|bad/);
  assert.equal((css.match(/@container/g) ?? []).length, 2);
});

test("screen sizes inherit from larger screens", () => {
  const style: Responsive<Style> = { desktop: { fontSize: 60, color: "#111111" }, tablet: { fontSize: 44 }, mobile: { color: "#222222" } };
  assert.deepEqual(resolveStyle(style, "desktop"), { fontSize: 60, color: "#111111" });
  assert.deepEqual(resolveStyle(style, "tablet"), { fontSize: 44, color: "#111111" });
  assert.deepEqual(resolveStyle(style, "mobile"), { fontSize: 44, color: "#222222" });
});

test("upgrade ignores unsafe legacy images and leaves unsupported sections alone", () => {
  const ctx = { sections: [] };
  const hero = upgradeSection({ id: "h", type: "hero", data: { hero_image: "javascript:x", headline: "T" } }, ctx);
  assert.equal(hero.elements, undefined, "never written to the key the Python publisher uses");
  const image = (hero.canvas_elements as { role: string; src?: string }[]).find(e => e.role === "image");
  assert.equal(image?.src, undefined);
  const faq = { id: "f", type: "faq", data: { faqs: [] } };
  assert.equal(upgradeSection(faq, ctx), faq);
});

test("canvas elements never collide with the Python publisher's free elements", () => {
  const ctx = { sections: [] };
  const free = [{ kind: "button", text: "Free", x: 10, y: 20 }];
  const withFree = upgradeSection({ id: "h", type: "hero", data: { headline: "T" }, elements: free }, ctx);
  assert.deepEqual(withFree.elements, free, "Python free elements are kept untouched");
  assert.ok(Array.isArray(withFree.canvas_elements));
  assert.equal(getElements({ id: "c", type: "custom", data: {}, elements: free }), undefined);
});

test("sections saved with the old key are moved to the new key", () => {
  const old = { id: "h", type: "hero", data: {}, elements: [{ id: "el_1", kind: "heading", slot: "content", role: "headline", text: "Hi", style: { desktop: {} } }] };
  assert.equal(needsKeyMigration(old), true);
  const moved = upgradeSection(old, { sections: [] });
  assert.equal(moved.elements, undefined);
  assert.equal(needsKeyMigration(moved), false);
  assert.equal(getElements(moved)?.[0].text, "Hi");
});
