import { test } from "node:test";
import assert from "node:assert/strict";
import { contentSignature, editorPayload, prepareSite, type EditorSite } from "../src/features/studio/editor-model";
import { SITE_STYLES, siteStyle, updateTheme, readTheme, themeVariables } from "../src/features/studio/studio-theme";
import { countUpTarget } from "../src/features/studio/motion";
import { FONT_STACKS } from "../src/features/studio/site-schema";

test("theme-only edits are dirty and round trip with existing theme settings", () => {
  const site: EditorSite = { site_id: "s", name: "Demo", schema_json: [], theme_config: { legacy: true, studio: { extra: "keep" } } };
  const patch = { accent: "#123456", ink: "#111111", headingFont: "classic", bodyFont: "friendly", radius: 0 };
  const next = updateTheme(site, patch);
  assert.notEqual(contentSignature(site), contentSignature(next));
  const saved = prepareSite({ ...site, ...JSON.parse(JSON.stringify(editorPayload(next))) });
  assert.deepEqual(saved.theme_config, { legacy: true, studio: { extra: "keep", ...patch } });
  assert.deepEqual(themeVariables(saved.theme_config), { "--accent": patch.accent, "--ink": patch.ink, "--body-font": FONT_STACKS.friendly, "--heading-font": FONT_STACKS.classic, "--button-radius": "0px" });
  assert.deepEqual(readTheme(site.theme_config), {});
});

test("old or malformed themes fall back to the renderer's defaults", () => {
  for (const value of [undefined, null, [], { studio: { accent: "url(x)", ink: "red", radius: -1, bodyFont: "constructor" } }]) {
    assert.deepEqual(readTheme(value), {});
  }
});

test("the look is classic unless the site chose modern, and bad values are ignored", () => {
  assert.deepEqual([...SITE_STYLES], ["classic", "modern"]);
  assert.equal(siteStyle(undefined), "classic");
  assert.equal(siteStyle({ studio: { style: "modern" } }), "modern");
  for (const bad of ["Modern", "neon", 1, null, "__proto__"]) assert.equal(siteStyle({ studio: { style: bad } }), "classic");
  const site: EditorSite = { site_id: "s", name: "Demo", schema_json: [], theme_config: { studio: { accent: "#123456" } } };
  const next = updateTheme(site, { style: "modern" });
  assert.deepEqual(next.theme_config, { studio: { accent: "#123456", style: "modern" } }, "changing the look keeps the other theme settings");
  assert.equal(siteStyle(updateTheme(next, { style: "nope" as never }).theme_config), "modern", "an invalid look is not saved");
  assert.ok(!("--style" in themeVariables(next.theme_config)), "the look is an attribute, not a colour variable");
});

test("figures count up to their real value and keep their extra characters", () => {
  const value = (text: string, n?: number) => { const t = countUpTarget(text); return t ? (n === undefined ? t.value : t.format(n)) : null; };
  assert.equal(value("60+"), 60);
  assert.equal(value("60+", 12), "12+");
  assert.equal(value("1,200", 950), "950");
  assert.equal(value("1,200", 1200), "1,200");
  assert.equal(value("€25k", 7), "€7k");
  assert.equal(value(" 25 "), 25);
  for (const still of ["", "1", "0", "Days", "3.5", "2026–2027", "12345678"]) assert.equal(countUpTarget(still), null, still);
});
