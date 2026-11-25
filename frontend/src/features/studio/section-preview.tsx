"use client";
import { useMemo } from "react";
import { instantiateComponent } from "./component-instance";
import { sampleEvent } from "./event-details";
import { SiteRenderer } from "./site-renderer";
import { upgradeSection } from "./site-schema";
import type { Section } from "./document";
import type { LibraryComponent } from "./component-catalog";

/**
 * A library entry drawn by the real page renderer, with the same starter content the organiser gets when adding it.
 * There are no separate mock-ups, so a preview can never show something the published page does not do.
 */
export function SectionPreview({ item, brand, accent, logo }: { item: LibraryComponent; brand?: string; accent?: string; logo?: string }) {
  const section = useMemo(() => {
    const raw = instantiateComponent(item, brand || "Your brand") as unknown as Section;
    const withLogo = logo && raw.type === "navbar" ? { ...raw, data: { ...raw.data, brand_mode: "image", logo_url: logo } } : raw;
    return upgradeSection(withLogo, { sections: [withLogo] });
  }, [item, brand, logo]);
  // Previews only: a start date and a venue, so the countdown and venue blocks show what they do. Real sites use their own Event details.
  const event = useMemo(() => {
    const sample = sampleEvent();
    const year = new Date().getFullYear() + 1;
    return { ...sample, basics: { ...sample.basics, starts: `${year}-06-15`, ends: `${year}-06-17`, venue: "City Conference Centre", address: "1 Harbour Street\nCity" } } as Record<string, unknown>;
  }, []);
  return (
    <div aria-label={`${item.name} preview`}>
      <SiteRenderer sections={[section]} themeConfig={accent ? { accent } : undefined} event={event} />
    </div>
  );
}
