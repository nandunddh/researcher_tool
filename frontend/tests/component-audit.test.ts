/** Quality audit of the block library: every entry is complete, renders, and only promises what the code really does. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { componentCatalog } from "../src/features/studio/component-catalog";
import { instantiateComponent } from "../src/features/studio/component-instance";
import { sectionLayouts } from "../src/features/studio/editor-model";
import { sectionRegistry } from "../src/features/studio/section-registry";
import { elementSections, safeUrl } from "../src/features/studio/site-schema";
import { ILLUSTRATIONS, SYMBOLS, isIllustration, isSymbol, symbolNames, symbolPath } from "../src/features/studio/site-symbols";

const studio = (file: string) => readFileSync(join(process.cwd(), "src/features/studio", file), "utf8");
const rendererCss = studio("site-renderer.module.css");
const blocksCss = studio("section-blocks.module.css");
const rendererSource = studio("site-renderer.tsx");
const instances = componentCatalog.map(item => ({ item, instance: instantiateComponent(item, "Sample brand") }));

/** Walks any value and yields every string in it with the key it was stored under. */
function* strings(value: unknown, key = ""): Generator<[string, string]> {
  if (typeof value === "string") yield [key, value];
  else if (Array.isArray(value)) for (const v of value) yield* strings(v, key);
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) yield* strings(v, k);
}

test("every entry is complete", () => {
  for (const { item } of instances) {
    for (const field of ["id", "name", "category", "description"] as const) assert.ok(item[field].trim(), `${item.id}: ${field} is empty`);
    assert.match(item.description, /[.!?]$/, `${item.id}: the description should be a full sentence`);
    assert.ok(item.features.every(f => f.trim()), `${item.id}: empty feature`);
    assert.ok(item.version >= 1);
  }
});

test("every entry turns into something the editor can draw and edit", () => {
  for (const { item, instance } of instances) {
    const drawable = Object.hasOwn(sectionRegistry, instance.type) || (elementSections as readonly string[]).includes(instance.type);
    assert.ok(drawable, `${item.id}: type "${instance.type}" has no editor description`);
  }
});

test("starter content has no leftover dummy text and no unsafe or empty links", () => {
  for (const { item, instance } of instances) {
    for (const [key, value] of strings(instance.data)) {
      if (key === "html") continue;
      assert.doesNotMatch(value, /lorem|ipsum|\bTODO\b|\bFIXME\b|asdf/i, `${item.id}: dummy text in ${key}`);
      if (/^(url|cta_link|btn_url|primary_btn_url|secondary_btn_url|logo_url|image_url|hero_image)$/.test(key) && value) {
        assert.ok(value.startsWith("#") || safeUrl(value) !== undefined, `${item.id}: unsafe link in ${key}`);
      }
    }
  }
});

test("every button in a content block has text and a link", () => {
  for (const { item, instance } of instances) {
    for (const node of (instance.data.nodes as { kind: string; text: string; url?: string }[] | undefined) ?? []) {
      if (node.kind !== "button") continue;
      assert.ok(node.text.trim(), `${item.id}: button without text`);
      assert.ok(node.url, `${item.id}: button "${node.text}" has no link`);
    }
  }
});

test("content blocks only use kinds and effects the renderer implements", () => {
  const kinds = new Set(["heading", "text", "button", "icon", "illustration", "divider", "menu"]);
  for (const { item, instance } of instances) {
    for (const node of (instance.data.nodes as { kind: string; effect?: string }[] | undefined) ?? []) {
      assert.ok(kinds.has(node.kind), `${item.id}: unknown block kind ${node.kind}`);
      if (node.effect) {
        assert.ok(["lift", "gradient"].includes(node.effect), `${item.id}: unknown effect ${node.effect}`);
        assert.match(blocksCss, new RegExp(`data-effect=${node.effect}`), `${item.id}: effect ${node.effect} has no style`);
      }
    }
  }
  assert.match(blocksCss, /prefers-reduced-motion: no-preference/, "motion must respect the visitor's setting");
});

test("every navigation variant is selectable, styled, and keeps its promises", () => {
  const promised = new Set(["Brand and links", "Primary button", "Mobile menu", "Centered brand", "Contact button", "Colour accent bar", "Booking button",
    "Floating header that stays on top", "Centered masthead", "Subscribe button", "Stays at the top", "Register button", "Dark bar"]);
  const navs = componentCatalog.filter(c => c.category === "Navigation" && c.id.startsWith("nav-"));
  assert.ok(navs.length >= 7);
  for (const nav of navs) {
    assert.ok(Object.hasOwn(sectionLayouts.navbar, nav.variant), `${nav.id}: ${nav.variant} is not a selectable layout`);
    if (nav.variant !== "business") assert.match(rendererCss, new RegExp(`data-layout=${nav.variant}`), `${nav.id}: no style for ${nav.variant}`);
    for (const feature of nav.features) assert.ok(promised.has(feature), `${nav.id}: "${feature}" is not something the header does`);
    if (nav.features.includes("Mobile menu")) {
      assert.match(rendererSource, /<details className=\{styles\.mobileMenu\}/, "mobile menu markup");
      assert.match(rendererCss, /\.navbar\[data-collapsible\] \.mobileMenu \{ display: block/, "mobile menu is shown on small screens");
    }
    if (nav.features.includes("Stays at the top")) assert.match(rendererCss, new RegExp(`data-layout=${nav.variant}[^}]*\\)? ?\\{[^}]*sticky|data-layout=${nav.variant}\\][^{]*\\{[^}]*sticky|\\[data-layout=${nav.variant}\\][^{]*,?[^{]*\\{[^}]*position: sticky`, "s"));
  }
  assert.deepEqual(Object.keys(sectionLayouts.navbar).sort(), navs.map(n => n.variant).sort(), "the Layout list and the library show the same headers");
});

test("a new header starts with a working brand, links and button", () => {
  for (const { item, instance } of instances.filter(x => x.item.category === "Navigation" && x.item.id.startsWith("nav-"))) {
    const d = instance.data as { brand_name: string; links: { label: string; url: string }[]; cta_label: string; cta_link: string; layout_variant: string };
    assert.equal(d.brand_name, "Sample brand");
    assert.equal(d.layout_variant, item.variant);
    assert.ok(d.links.length >= 3 && d.links.every(l => l.label && l.url));
    assert.ok(d.cta_label && d.cta_link, `${item.id}: header without a button`);
  }
});

test("site symbols are drawable outlines and unknown names never draw nothing", () => {
  assert.ok(symbolNames.length >= 12);
  for (const name of symbolNames) {
    assert.match(SYMBOLS[name], /^M[MmLlHhVvCcSsAaZz0-9 .,-]+$/, `${name}: path`);
    assert.ok(isSymbol(name));
  }
  assert.equal(symbolPath("not-a-symbol"), SYMBOLS.circle);
  assert.equal(symbolPath(undefined), SYMBOLS.circle);
  assert.equal(symbolPath("__proto__"), SYMBOLS.circle, "inherited keys are not symbols");
  assert.ok(ILLUSTRATIONS.every(isIllustration) && !isIllustration("nope"));
});

test("the asset blocks draw what their names say", () => {
  const nodes = (id: string) => instances.find(x => x.item.id === id)!.instance.data.nodes as Record<string, unknown>[];
  const icons = nodes("icons-outline");
  assert.equal(icons.length, 3);
  assert.equal(new Set(icons.map(n => n.symbol)).size, 3, "three different icons");
  assert.ok(icons.every(n => n.kind === "icon" && isSymbol(n.symbol)));
  const [art] = nodes("svg-orbit");
  assert.deepEqual([art.kind, isIllustration(art.art)], ["illustration", true]);
  const [band] = nodes("background-aurora");
  assert.equal(band.effect, "gradient");
  assert.ok(Number(band.padding) >= 48, "an empty band needs height to be visible");
  assert.match(String(band.start), /^#[0-9a-f]{6}$/i);
  assert.match(String(band.end), /^#[0-9a-f]{6}$/i);
});
