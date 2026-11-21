import { test } from "node:test";
import assert from "node:assert/strict";
import { componentCatalog } from "../src/features/studio/component-catalog";
import { instantiateComponent } from "../src/features/studio/component-instance";
import { registerImported, type ImportedDesign } from "../src/features/studio/design-library";

const design: ImportedDesign = { id: "abc", kind: "section", name: "Speaker spotlight", category: "Speakers", level: "pro", description: "", created_at: "",
  section: { type: "content", data: { columns: 2, nodes: [{ kind: "heading", text: "Keynote" }] } } };

test("imported sections join the catalog once and place fresh copies", () => {
  const before = componentCatalog.length;
  registerImported([design, { ...design, id: "tpl", kind: "template", section: undefined }]);
  registerImported([design]);
  assert.equal(componentCatalog.length, before + 1, "re-registering replaces, templates stay out");
  const item = componentCatalog.find(c => c.id === "lib-abc")!;
  const a = instantiateComponent(item), b = instantiateComponent(item);
  assert.equal(a.type, "content");
  assert.notEqual(a.id, b.id);
  const nodes = (x: typeof a) => x.data.nodes as { id: string; text: string }[];
  assert.notEqual(nodes(a)[0].id, nodes(b)[0].id);
  nodes(a)[0].text = "changed";
  assert.equal((item.preset!.data.nodes as { text: string }[])[0].text, "Keynote", "library copy is untouched");
  registerImported([]);
  assert.equal(componentCatalog.length, before);
});
