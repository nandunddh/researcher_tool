"use client";
import type { Section } from "./document";
import { componentCatalog } from "./component-catalog";
import { SectionPreview } from "./section-preview";

/** Draws a library section the renderer has no element design for yet, so the
 *  canvas and the preview page show the same thing for every section. */
export function libraryFallback(siteName?: string) {
  return function LibrarySection(section: Section) {
    const library = section.library;
    const id = library && typeof library === "object" && !Array.isArray(library) ? library.id : undefined;
    const item = componentCatalog.find(c => c.id === id);
    return item ? <SectionPreview item={item} brand={siteName} /> : null;
  };
}
