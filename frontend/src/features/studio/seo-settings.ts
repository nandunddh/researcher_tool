/**
 * Search, social sharing and analytics settings for a website. Stored in the
 * site's existing `meta_config`; settings this screen does not show (such as
 * older custom code) are kept unchanged when saving.
 */
import { safeImage } from "./site-schema";

export type SeoSettings = {
  meta_title: string;
  meta_description: string;
  meta_keywords: string;
  og_image: string;
  canonical_url: string;
  indexable: boolean;
  ga_tracking_id: string;
};

export const limits = { title: 60, description: 160, maxTitle: 120, maxDescription: 500, maxKeywords: 300 } as const;
const GA_ID = /^(G|GT|AW)-[A-Z0-9]{4,16}$|^UA-\d{4,10}-\d{1,4}$/;

type SiteLike = { name?: string; meta_config?: unknown; [key: string]: unknown };
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const text = (v: unknown) => (typeof v === "string" ? v : "");

/** Reads current settings, falling back to older top-level fields. */
export function readSeo(site: SiteLike): SeoSettings {
  const cfg = rec(site.meta_config);
  const pick = (key: string) => text(cfg[key]) || text(site[key]);
  return {
    meta_title: pick("meta_title"),
    meta_description: pick("meta_description"),
    meta_keywords: pick("meta_keywords"),
    og_image: pick("og_image"),
    canonical_url: pick("canonical_url"),
    indexable: !/noindex/i.test(pick("robots")),
    ga_tracking_id: pick("ga_tracking_id") || text(site.ga_code),
  };
}

export type SeoProblems = Partial<Record<keyof SeoSettings, string>>;

/** Problems that block saving, in plain language. Length advice is shown separately. */
export function seoProblems(s: SeoSettings): SeoProblems {
  const out: SeoProblems = {};
  if (s.meta_title.length > limits.maxTitle) out.meta_title = `Keep the title under ${limits.maxTitle} characters.`;
  if (s.meta_description.length > limits.maxDescription) out.meta_description = `Keep the description under ${limits.maxDescription} characters.`;
  if (s.meta_keywords.length > limits.maxKeywords) out.meta_keywords = `Keep keywords under ${limits.maxKeywords} characters.`;
  if (s.og_image && !safeImage(s.og_image)) out.og_image = "Use an uploaded image or a link starting with https://";
  if (s.canonical_url && !/^https:\/\/[^\s/]+\.[^\s]+$/i.test(s.canonical_url.trim())) out.canonical_url = "Enter a full address starting with https://";
  if (s.ga_tracking_id && !GA_ID.test(s.ga_tracking_id.trim().toUpperCase())) out.ga_tracking_id = "This doesn’t look like a Google Analytics ID. It usually starts with G-, for example G-AB12CD34EF.";
  return out;
}

/** Builds the save request: merges into the existing meta_config, never replacing unknown keys. */
export function seoPayload(site: SiteLike, s: SeoSettings): { meta_config: Record<string, unknown> } {
  const existing = rec(site.meta_config);
  return {
    meta_config: {
      ...existing,
      meta_title: s.meta_title.trim(),
      meta_description: s.meta_description.trim(),
      meta_keywords: s.meta_keywords.trim(),
      og_image: s.og_image.trim(),
      canonical_url: s.canonical_url.trim(),
      robots: s.indexable ? "index, follow" : "noindex, nofollow",
      ga_tracking_id: s.ga_tracking_id.trim().toUpperCase(),
    },
  };
}

/** Text Google is likely to show, cut the way search results cut it. */
export function searchSnippet(s: SeoSettings, siteName: string) {
  const cut = (v: string, n: number) => (v.length > n ? `${v.slice(0, n - 1).trimEnd()}…` : v);
  return {
    title: cut(s.meta_title || siteName || "Untitled website", limits.title),
    description: cut(s.meta_description || "Add a description so people know what your website is about.", limits.description),
  };
}
