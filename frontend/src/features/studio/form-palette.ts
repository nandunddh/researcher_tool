import { addListItem, moveListItem, setSectionField, type EditorSite } from "./editor-model";
import { sectionRegistry } from "./section-registry";

export const paletteMime = "application/x-scistudio-field-type";
export const reorderMime = "application/x-scistudio-field-index";
export const fieldTypes = sectionRegistry.contact.lists[0].fields.find(field => field.key === "type")!.options!;

export function editFormFields(site: EditorSite, sectionId: string, action: string | { from: number; to: number }) {
  const section = site.schema_json.find(item => item.id === sectionId);
  const def = section && sectionRegistry[section.type]?.lists.find(item => item.key === "form_fields");
  if (!section || !def?.defaults) return site;
  const saved = section.data.form_fields;
  const fields = Array.isArray(saved) && saved.length ? saved : def.defaults;
  const customize = () => fields === saved ? site : setSectionField(site, sectionId, ["form_fields"], structuredClone(fields));
  if (typeof action === "string") {
    const choice = fieldTypes.find(([type]) => type === action);
    if (!choice || fields.length >= def.max) return site;
    return addListItem(customize(), sectionId, "form_fields", {
      ...def.newItem(), type: action, label: choice[1],
      ...(action === "select" ? { options: ["Option 1", "Option 2"] } : {}),
    }, def.max);
  }
  const { from, to } = action;
  if (![from, to].every(index => Number.isInteger(index) && index >= 0 && index < fields.length) || from === to) return site;
  return moveListItem(customize(), sectionId, "form_fields", from, to - from);
}
