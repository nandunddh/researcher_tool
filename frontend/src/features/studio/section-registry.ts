/**
 * Describes each content section's editable fields in plain language. The same
 * description drives the inspector and in-place editing. Data stays in the
 * existing `data` shape, so saved sites and templates keep working unchanged.
 */
import type { Json } from "./document";
import { safeImage, safeUrl } from "./site-schema";

export type FieldKind = "text" | "textarea" | "image" | "link" | "toggle" | "lines" | "select" | "number";
export type FieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  hint?: string;
  placeholder?: string;
  options?: [string, string][];
  min?: number;
  max?: number;
};
export type ListDef = { key: string; label: string; itemLabel: string; fields: FieldDef[]; newItem: () => Record<string, Json>; max: number;
  /** Used until the list is first customised (e.g. a form's built-in fields). */
  defaults?: Record<string, Json>[] };
export type SectionDef = { name: string; header: boolean; fields: FieldDef[]; lists: ListDef[] };

const t = (key: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({ key, label, kind: "text", ...extra });
const area = (key: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({ key, label, kind: "textarea", ...extra });
const designs: [string, string][] = [["grid", "Cards in a grid"], ["list", "Simple list"], ["spotlight", "One large card"]];
const cardsSection = (name: string, itemLabel: string): SectionDef => ({
  name, header: true,
  fields: [{ key: "design", label: "Layout", kind: "select", options: designs }],
  lists: [{
    key: "items", label: `${itemLabel}s`, itemLabel, max: 24,
    fields: [t("title", "Title"), area("description", "Description"), { key: "image", label: "Image", kind: "image" }],
    newItem: () => ({ title: `New ${itemLabel.toLowerCase()}`, description: "Add a short description.", image: "" }),
  }],
});

export const sectionRegistry: Record<string, SectionDef> = {
  features: {
    name: "Highlights", header: true, fields: [],
    lists: [{
      key: "items", label: "Highlights", itemLabel: "Highlight", max: 12,
      fields: [t("title", "Title"), area("description", "Description")],
      newItem: () => ({ title: "New highlight", description: "Describe why it matters.", icon: "" }),
    }],
  },
  speakers: {
    name: "Speakers", header: true, fields: [],
    lists: [{
      key: "speakers", label: "Speakers", itemLabel: "Speaker", max: 48,
      fields: [t("name", "Name"), t("role", "Role or title"), t("affiliation", "Organization"),
        { key: "photo", label: "Photo", kind: "image" }, area("bio", "Short bio")],
      newItem: () => ({ name: "New speaker", role: "Role / title", affiliation: "", photo: "", bio: "" }),
    }],
  },
  pricing: {
    name: "Registration passes", header: true, fields: [],
    lists: [{
      key: "tiers", label: "Passes", itemLabel: "Pass", max: 8,
      fields: [t("name", "Pass name"), t("price", "Price", { placeholder: "$149" }), t("period", "Billing", { placeholder: "one-time" }),
        area("description", "Who it is for"), { key: "features", label: "What's included", kind: "lines", hint: "One item per line." },
        t("btn_label", "Button text"), { key: "btn_url", label: "Button link", kind: "link" },
        { key: "featured", label: "Highlight this pass", kind: "toggle" }, t("badge", "Badge", { placeholder: "MOST POPULAR" })],
      newItem: () => ({ name: "New pass", price: "$0", period: "one-time", description: "", features: ["Included item"], btn_label: "Select pass", btn_url: "#contact", featured: false }),
    }],
  },
  gallery: {
    name: "Gallery", header: true, fields: [],
    lists: [{
      key: "images", label: "Photos", itemLabel: "Photo", max: 36,
      fields: [{ key: "url", label: "Image", kind: "image" }, t("caption", "Caption")],
      newItem: () => ({ url: "", caption: "New photo" }),
    }],
  },
  faq: {
    name: "Questions & answers", header: true, fields: [],
    lists: [{
      key: "faqs", label: "Questions", itemLabel: "Question", max: 40,
      fields: [t("q", "Question"), area("a", "Answer")],
      newItem: () => ({ q: "New question?", a: "Add the answer here." }),
    }],
  },
  contact: {
    name: "Contact", header: true,
    fields: [t("email", "Email address"), t("phone", "Phone number"), t("address", "Address or venue"), t("btn_text", "Form button text"),
      t("success_message", "Thank-you message", { placeholder: "Thank you! Your message has been sent." }),
      { key: "form_layout", label: "Design", kind: "select", options: [["split", "Details beside form"], ["centered", "Centered card"], ["inline", "Compact row"], ["image", "With image"], ["dark", "Dark band"]] },
      { key: "image", label: "Image (for “With image”)", kind: "image" }],
    lists: [{
      key: "form_fields", label: "Form fields", itemLabel: "Field", max: 20,
      // Shown until the user customises them; must match backend/forms.py DEFAULT_CONTACT_FIELDS.
      defaults: [
        { id: "name", label: "Name", type: "text", required: true },
        { id: "email", label: "Email", type: "email", required: true },
        { id: "message", label: "Message", type: "textarea", required: true },
      ],
      fields: [t("label", "Label"),
        { key: "type", label: "Type", kind: "select", options: [["text", "Short text"], ["email", "Email"], ["phone", "Phone"], ["textarea", "Long text"], ["select", "Dropdown"], ["checkbox", "Checkbox"]] },
        { key: "required", label: "Required", kind: "toggle" },
        { key: "options", label: "Dropdown options", kind: "lines", hint: "Only for dropdowns. One option per line." }],
      newItem: () => ({ id: `f_${crypto.randomUUID().slice(0, 8)}`, label: "New field", type: "text", required: false }),
    }],
  },
  footer: {
    name: "Footer", header: false,
    fields: [t("brand_name", "Name"), t("tagline", "Short description"), t("copyright", "Copyright line")],
    lists: [{
      key: "links", label: "Links", itemLabel: "Link", max: 12,
      fields: [t("label", "Text"), { key: "url", label: "Link", kind: "link" }],
      newItem: () => ({ label: "New link", url: "#" }),
    }],
  },
  form_button: {
    name: "Button form", header: false,
    fields: [t("section_title", "Heading above the button (optional)"), t("btn_label", "Button text"),
      t("popup_title", "Popup title"), area("popup_text", "Popup intro text"), t("submit_label", "Send button text"),
      t("success_message", "Thank-you message", { placeholder: "Thank you! Your message has been sent." })],
    lists: [],
  },
  about: cardsSection("About", "Story"),
  stats: cardsSection("Statistics", "Figure"),
  agenda: cardsSection("Agenda", "Session"),
  sponsors: cardsSection("Sponsors", "Sponsor"),
  testimonials: cardsSection("Testimonials", "Quote"),
  announcement: cardsSection("Announcement", "Notice"),
  image: {
    name: "Image", header: false,
    fields: [{ key: "image_url", label: "Image", kind: "image" }, t("caption", "Caption")],
    lists: [],
  },
  custom: {
    name: "Custom code", header: false,
    fields: [area("html", "HTML code", { hint: "Shown in a sealed frame: scripts and forms do not run." }),
      { key: "height", label: "Height (px)", kind: "number", min: 100, max: 2000 }],
    lists: [],
  },
  content: {
    name: "Content blocks", header: false, fields: [],
    lists: [{
      key: "nodes", label: "Blocks", itemLabel: "Block", max: 24,
      fields: [area("text", "Text"), { key: "url", label: "Link (buttons)", kind: "link" }],
      newItem: () => ({ id: crypto.randomUUID(), kind: "text", text: "New block", size: 18, padding: 16, span: 1 }),
    }],
  },
};

sectionRegistry.form_button.lists = sectionRegistry.contact.lists;
sectionRegistry.registration = {
  name: "Registration", header: true,
  fields: [t("currency", "Currency", { placeholder: "USD" }),
    t("early_bird_ends", "Early bird ends (YYYY-MM-DD)", { placeholder: "2027-03-31" }),
    t("standard_ends", "Standard ends (YYYY-MM-DD)", { placeholder: "2027-05-31", hint: "After this date the late price applies." }),
    t("btn_text", "Button text"), t("success_message", "Message after payment")],
  lists: [
    { key: "categories", label: "Registration types", itemLabel: "Type", max: 12,
      fields: [t("name", "Name"), { key: "early", label: "Early bird price", kind: "number", max: 1000000 },
        { key: "standard", label: "Standard price", kind: "number", max: 1000000 }, { key: "late", label: "Late price", kind: "number", max: 1000000 }],
      newItem: () => ({ id: `cat_${crypto.randomUUID().slice(0, 6)}`, name: "New type", early: 0, standard: 0, late: 0 }) },
    { key: "addons", label: "Add-ons", itemLabel: "Add-on", max: 10,
      fields: [t("name", "Name"), { key: "price", label: "Price each", kind: "number", max: 1000000 }, { key: "max", label: "Maximum quantity", kind: "number", min: 1, max: 20 }],
      newItem: () => ({ id: `add_${crypto.randomUUID().slice(0, 6)}`, name: "New add-on", price: 0, max: 5 }) },
    { key: "discount_codes", label: "Discount codes (hidden from visitors)", itemLabel: "Code", max: 50,
      fields: [t("code", "Code"), { key: "percent", label: "Discount %", kind: "number", min: 1, max: 100 }],
      newItem: () => ({ code: "EARLY10", percent: 10 }) },
    { ...sectionRegistry.contact.lists[0], defaults: [
      { id: "name", label: "Full name", type: "text", required: true }, { id: "email", label: "Email", type: "email", required: true },
      { id: "organization", label: "Organization", type: "text", required: true }, { id: "phone", label: "Phone", type: "phone", required: false },
      { id: "country", label: "Country", type: "text", required: true }] },
  ],
};

export const headerFields: FieldDef[] = [
  t("section_tag", "Small label", { placeholder: "KEY FOCUS" }),
  t("section_title", "Title"),
  area("section_subtitle", "Subtitle"),
];

/** Checks a value for a field before it is stored. Returns undefined to refuse it. */
export function cleanFieldValue(kind: FieldKind, value: unknown, def?: FieldDef): Json | undefined {
  switch (kind) {
    case "text": case "textarea": case "select":
      return typeof value === "string" ? value.slice(0, kind === "textarea" ? 20000 : 500) : undefined;
    case "image":
      if (value === "") return "";
      return safeImage(value);
    case "link":
      if (value === "" || value === "#") return "#";
      return safeUrl(value);
    case "toggle":
      return typeof value === "boolean" ? value : undefined;
    case "lines":
      return typeof value === "string" ? value.split("\n").map(line => line.slice(0, 300)).slice(0, 40) : undefined;
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return undefined;
      return Math.min(def?.max ?? 1e6, Math.max(def?.min ?? 0, Math.round(n)));
    }
  }
}
