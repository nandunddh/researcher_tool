import { test } from "node:test";
import assert from "node:assert/strict";
import { safeReturnPath, studioPath, isNamespace } from "../src/lib/contracts";
import { legacySections, readDocument } from "../src/features/studio/document";

test("return paths cannot redirect outside the workspace", () => {
  for (const path of ["https://example.com", "//example.com", "/\\example.com", "/api/auth/logout", "/organization/\r\nother", "/dashboardx", "/scistudio-evil", "/collector.evil.com"]) assert.equal(safeReturnPath(path), null, path);
  for (const path of ["/dashboard", "/collector/nih", "/scistudio/site_12345678/react-edit", "/account", "/billing?plan=pro", "/root/demo-requests"]) assert.equal(safeReturnPath(path), path, path);
  // old addresses are still accepted; next.config.ts redirects them to the short ones
  assert.equal(safeReturnPath("/organization/scistudio/site_12345678/edit"), "/organization/scistudio/site_12345678/edit");
});
test("clean edit and preview paths are the same for every account type", () => {
  assert.equal(studioPath(), "/scistudio");
  assert.equal(studioPath("site_12345678"), "/scistudio/site_12345678/react-edit");
  assert.equal(studioPath("site 1/2", "preview"), "/scistudio/site%201%2F2/preview");
  assert.equal(isNamespace("api"), false);
});
test("old documents round trip without losing custom settings or unknown sections", () => {
  const original = [{ id: "one", type: "future-widget", data: { title: "Keep me" }, studio_style: { gradient: "custom", background: "#ffffff" }, elements: [{ id: "button", x: 30, y: 15 }], field_formats: { headline: { weight: 700 } } }];
  const doc = readDocument(original);
  assert.deepEqual(legacySections(doc), original);
  doc.sections[0].data.title = "Changed";
  assert.equal(original[0].data.title, "Keep me");
});
test("invalid versions and duplicate section IDs are rejected", () => {
  assert.throws(() => readDocument({ schemaVersion: 2, sections: [] }));
  assert.throws(() => readDocument([{ id: "a", type: "hero", data: {} }, { id: "a", type: "image", data: {} }]));
});
