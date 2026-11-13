/** Compatibility boundary for the future React editor. Never discard unknown fields. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Section {
  id: string;
  type: string;
  title?: string;
  data: Record<string, Json>;
  [key: string]: Json | undefined;
}
export interface StudioDocument {
  schemaVersion: 1;
  sections: Section[];
}
export const componentRegistry = {
  navbar: { name: "Navigation bar", category: "Navigation" },
  hero: { name: "Hero", category: "Content" },
  features: { name: "Highlights", category: "Content" },
  speakers: { name: "Speakers", category: "Event" },
  pricing: { name: "Registration passes", category: "Event" },
  gallery: { name: "Gallery", category: "Media" },
  faq: { name: "FAQ", category: "Content" },
  contact: { name: "Contact form", category: "Forms" },
  footer: { name: "Footer", category: "Navigation" },
  about: { name: "About", category: "Content" },
  stats: { name: "Statistics", category: "Event" },
  agenda: { name: "Agenda", category: "Event" },
  sponsors: { name: "Sponsors", category: "Event" },
  testimonials: { name: "Testimonials", category: "Content" },
  announcement: { name: "Announcement", category: "Content" },
  image: { name: "Image", category: "Media" },
  custom: { name: "Custom HTML", category: "Custom" },
} as const;

export function readDocument(value: unknown): StudioDocument {
  const raw = Array.isArray(value) ? { schemaVersion: 1, sections: value } : value;
  if (!raw || typeof raw !== "object" || !("schemaVersion" in raw) || raw.schemaVersion !== 1 || !("sections" in raw) || !Array.isArray(raw.sections)) throw new Error("Unsupported website document version.");
  const ids = new Set<string>();
  for (const section of raw.sections) {
    if (!section || typeof section.id !== "string" || !section.id || ids.has(section.id) || typeof section.type !== "string" || !section.data || typeof section.data !== "object" || Array.isArray(section.data)) throw new Error("Invalid or duplicate website section.");
    ids.add(section.id);
  }
  return structuredClone(raw) as StudioDocument;
}
export function legacySections(document: StudioDocument): Section[] {
  return readDocument(document).sections;
}
