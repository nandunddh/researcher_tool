import { test } from "node:test";
import assert from "node:assert/strict";
import { editFormFields, fieldTypes } from "../src/features/studio/form-palette";
import { editorPayload, prepareSite, type EditorSite } from "../src/features/studio/editor-model";
import { sectionRegistry } from "../src/features/studio/section-registry";

for (const type of ["contact", "form_button", "registration"]) {
  test(type + " saves palette fields and their order", () => {
    const original: EditorSite = { name: "Demo", site_id: "s", schema_json: [{ id: "form", type, data: {} }] };
    let site = original;
    const defaults = sectionRegistry[type].lists.find(list => list.key === "form_fields")!.defaults!;
    for (const [kind] of fieldTypes) site = editFormFields(site, "form", kind);
    site = editFormFields(site, "form", { from: defaults.length + 5, to: 0 });
    const restored = prepareSite({ ...site, ...JSON.parse(JSON.stringify(editorPayload(site))) });
    const fields = restored.schema_json[0].data.form_fields as Record<string, unknown>[];
    assert.equal(fields[0].type, "checkbox");
    assert.deepEqual(fields.slice(1, defaults.length + 1), defaults);
    assert.deepEqual(fields.slice(defaults.length + 1).map(f => f.type), ["text", "email", "phone", "textarea", "select"]);
    assert.deepEqual(fields.at(-1)?.options, ["Option 1", "Option 2"]);
    assert.equal(new Set(fields.map(f => f.id)).size, fields.length);
    assert.deepEqual(original.schema_json[0].data, {});
  });
}
