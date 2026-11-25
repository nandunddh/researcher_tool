/**
 * Describes each content section's editable fields in plain language. The same
 * description drives the inspector and in-place editing. Data stays in the
 * existing `data` shape, so saved sites and templates keep working unchanged.
 */
import type { Json } from "./document";
import { safeImage, safeUrl } from "./site-schema";
import { symbolNames } from "./site-symbols";

export type FieldKind = "text" | "textarea" | "image" | "link" | "toggle" | "lines" | "select" | "number" | "date" | "money";
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
const designs: [string, string][] = [["grid", "Cards in a grid"], ["list", "Simple list"], ["spotlight", "One large card"], ["figures", "Large numbers"], ["quotes", "Quotes with photo"]];
const cardsSection = (name: string, itemLabel: string): SectionDef => ({
  name, header: true,
  fields: [{ key: "design", label: "Layout", kind: "select", options: designs }],
  lists: [{
    key: "items", label: `${itemLabel}s`, itemLabel, max: 24,
    fields: [t("title", "Title"), t("meta", "Small line", { hint: "For example a role, a date or a distance." }), area("description", "Description"),
      { key: "image", label: "Image", kind: "image" }, { key: "url", label: "Link (optional)", kind: "link" }, t("link_label", "Link text", { placeholder: "More information" })],
    newItem: () => ({ title: `New ${itemLabel.toLowerCase()}`, meta: "", description: "Add a short description.", image: "", url: "", link_label: "" }),
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
    name: "Speakers", header: true,
    fields: [{ key: "design", label: "Layout", kind: "select", options: [["cards", "Cards"], ["list", "List"], ["portraits", "Large portraits"]] }],
    lists: [{
      key: "speakers", label: "Speakers", itemLabel: "Speaker", max: 48,
      fields: [t("name", "Name"), t("role", "Role or title"), t("affiliation", "Organization"), t("talk", "Talk title"),
        { key: "photo", label: "Photo", kind: "image" }, area("bio", "Short bio")],
      newItem: () => ({ name: "New speaker", role: "Role / title", affiliation: "", talk: "", photo: "", bio: "" }),
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
    fields: [t("brand_name", "Name"), t("tagline", "Short description"), t("copyright", "Copyright line"),
      { key: "design", label: "Layout", kind: "select", options: [["simple", "One row of links"], ["columns", "Columns of links"]] }],
    lists: [{
      key: "links", label: "Links", itemLabel: "Link", max: 24,
      fields: [t("label", "Text"), { key: "url", label: "Link", kind: "link" },
        t("group", "Column heading", { placeholder: "Event", hint: "For the column layout: links with the same heading share a column." })],
      newItem: () => ({ label: "New link", url: "#", group: "" }),
    }, {
      key: "social", label: "Social links", itemLabel: "Social link", max: 8,
      fields: [t("label", "Name", { placeholder: "LinkedIn" }), { key: "url", label: "Link", kind: "link" }],
      newItem: () => ({ label: "Social network", url: "" }),
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
  travel: cardsSection("Travel and stay", "Place"),
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
      fields: [area("text", "Text"), { key: "url", label: "Link (buttons)", kind: "link" },
        { key: "symbol", label: "Icon (for icon blocks)", kind: "select", options: symbolNames.map(n => [n, n[0].toUpperCase() + n.slice(1)] as [string, string]) }],
      newItem: () => ({ id: crypto.randomUUID(), kind: "text", text: "New block", size: 18, padding: 16, span: 1 }),
    }],
  },
};

sectionRegistry.schedule = {
  name: "Schedule", header: true, fields: [],
  lists: [{
    key: "sessions", label: "Sessions", itemLabel: "Session", max: 120,
    fields: [t("day", "Day", { placeholder: "Day 1 · Monday 14 October", hint: "Sessions with the same day text are grouped under one heading." }),
      t("time", "Time", { placeholder: "09:00 – 10:00" }), t("title", "Session title"), t("speaker", "Speaker"),
      t("location", "Room or location"), t("track", "Track"), area("description", "Description")],
    newItem: () => ({ day: "Day 1", time: "", title: "New session", speaker: "", location: "", track: "", description: "" }),
  }],
};

sectionRegistry.sponsor_tiers = {
  name: "Sponsors", header: true,
  fields: [{ key: "design", label: "Layout", kind: "select", options: [["tiers", "Grouped by tier"], ["strip", "One row of logos"]] }],
  lists: [{
    key: "sponsors", label: "Sponsors", itemLabel: "Sponsor", max: 60,
    fields: [t("tier", "Tier", { placeholder: "Platinum", hint: "Sponsors with the same tier are grouped. The first tier is shown largest." }),
      t("name", "Name"), { key: "logo", label: "Logo", kind: "image" }, { key: "url", label: "Website", kind: "link" }],
    newItem: () => ({ tier: "Gold", name: "New sponsor", logo: "", url: "" }),
  }],
};

sectionRegistry.countdown = {
  name: "Countdown", header: true,
  fields: [{ key: "date", label: "Event date", kind: "date", hint: "Leave empty to use the start date from Event details." },
    t("done_text", "Message after the date", { placeholder: "The event has started." })],
  lists: [],
};
sectionRegistry.venue = {
  name: "Venue", header: true,
  fields: [{ key: "source", label: "Venue details", kind: "select", options: [["event", "From Event details"], ["custom", "Write it here"]] },
    t("name", "Venue name (when written here)"), area("address", "Address (when written here)"),
    { key: "image", label: "Photo of the venue", kind: "image" }, area("details", "Getting there", { hint: "Public transport, parking, accessibility." })],
  lists: [],
};

sectionRegistry.downloads = {
  name: "Downloads", header: true, fields: [],
  lists: [{
    key: "files", label: "Files", itemLabel: "File", max: 30,
    fields: [t("label", "Name"), { key: "url", label: "File link", kind: "link", hint: "A link to the file, for example a PDF on your website or in cloud storage." },
      t("note", "Type and size", { placeholder: "PDF, 2 MB" })],
    newItem: () => ({ label: "New file", url: "", note: "" }),
  }],
};
sectionRegistry.video = {
  name: "Video", header: true,
  fields: [t("url", "YouTube or Vimeo link", { placeholder: "https://www.youtube.com/watch?v=…" }),
    t("title", "Video title", { hint: "Read out by screen readers." }), t("caption", "Caption")],
  lists: [],
};

sectionRegistry.newsletter = {
  name: "Newsletter sign-up", header: true,
  fields: [t("btn_text", "Button text", { placeholder: "Subscribe" }),
    t("success_message", "Thank-you message", { placeholder: "Thank you! You are on the list." })],
  // Shown until the organiser changes them; must match DEFAULT_NEWSLETTER_FIELDS in backend/forms.py.
  lists: [{ ...sectionRegistry.contact.lists[0], defaults: [
    { id: "email", label: "Email", type: "email", required: true },
    { id: "consent", label: "I agree to receive emails about this event. I can unsubscribe at any time.", type: "checkbox", required: true },
  ] }],
};

sectionRegistry.form_button.lists = sectionRegistry.contact.lists;
sectionRegistry.submission = {
  name: "Abstract submission", header: true,
  fields: [{ key: "word_limit", label: "Word limit for the abstract", kind: "number", max: 5000, hint: "0 = no limit." },
    { key: "closes", label: "Last day to submit", kind: "date", hint: "Empty = open until you remove the form." },
    { key: "file_mode", label: "File upload", kind: "select", options: [["optional", "Optional"], ["required", "Required"], ["off", "No file"]] },
    t("id_prefix", "Submission ID prefix", { placeholder: "ABS-", hint: "IDs follow: ABS-0001, ABS-0002…" }),
    t("btn_text", "Button text"), t("success_message", "Message after submitting")],
  lists: [{ ...sectionRegistry.contact.lists[0], defaults: [{ id: "email", label: "Your email (for the confirmation)", type: "email", required: true }] }],
};
sectionRegistry.key_dates = {
  name: "Key dates", header: true,
  fields: [{ key: "show_prices", label: "Show when each price period ends", kind: "toggle" }, { key: "show_event", label: "Show the event's first and last day", kind: "toggle" }],
  lists: [],
};
sectionRegistry.registration = {
  name: "Registration", header: true,
  // Tickets, prices, add-ons and codes live in Event details; the form ticks which ones it offers.
  fields: [t("btn_text", "Button text"), t("success_message", "Message after payment")],
  lists: [
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
    case "date":
      return value === "" || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) ? value : undefined;
    case "money": {
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) ? Math.min(def?.max ?? 1e6, Math.max(0, Math.round(n * 100) / 100)) : undefined;
    }
    case "number": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) return undefined;
      return Math.min(def?.max ?? 1e6, Math.max(def?.min ?? 0, Math.round(n)));
    }
  }
}
