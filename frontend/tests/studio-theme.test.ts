import { test } from "node:test";
import assert from "node:assert/strict";
import { contentSignature, editorPayload, prepareSite, type EditorSite } from "../src/features/studio/editor-model";
import { updateTheme, readTheme, themeVariables } from "../src/features/studio/studio-theme";
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
