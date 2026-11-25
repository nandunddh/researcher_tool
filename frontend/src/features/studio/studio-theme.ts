import { FONT_STACKS } from "./site-schema";
import type { EditorSite } from "./editor-model";

/** Site-wide looks. "classic" is the original design; "modern" adds depth, gradients and gentle motion. */
export const SITE_STYLES = ["classic", "modern"] as const;
export type SiteStyle = (typeof SITE_STYLES)[number];
export const themeDefaults = { accent: "#5a45d6", ink: "#18223b", headingFont: "modern", bodyFont: "modern", radius: 10, style: "classic" as SiteStyle };
export type StudioTheme = typeof themeDefaults;
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function readTheme(config: unknown): Partial<StudioTheme> {
  const raw = record(record(config).studio);
  const result: Partial<StudioTheme> = {};
  for (const key of ["accent", "ink"] as const) {
    const value = raw[key];
    if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) result[key] = value;
  }
  for (const key of ["headingFont", "bodyFont"] as const) {
    const value = raw[key];
    if (typeof value === "string" && Object.hasOwn(FONT_STACKS, value)) result[key] = value;
  }
  if (typeof raw.radius === "number" && Number.isInteger(raw.radius) && raw.radius >= 0 && raw.radius <= 48) result.radius = raw.radius;
  if (typeof raw.style === "string" && (SITE_STYLES as readonly string[]).includes(raw.style)) result.style = raw.style as SiteStyle;
  return result;
}
/** The look a site uses; anything unknown is the classic look. */
export function siteStyle(config: unknown): SiteStyle {
  return readTheme(config).style ?? "classic";
}
export function updateTheme(site: EditorSite, patch: Partial<StudioTheme>): EditorSite {
  const config = record(site.theme_config);
  return { ...site, theme_config: { ...config, studio: { ...record(config.studio), ...readTheme({ studio: patch }) } } };
}
export function themeVariables(config: unknown) {
  const theme = readTheme(config);
  return {
    "--accent": theme.accent, "--ink": theme.ink,
    "--heading-font": theme.headingFont && FONT_STACKS[theme.headingFont],
    "--body-font": theme.bodyFont && FONT_STACKS[theme.bodyFont],
    "--button-radius": theme.radius === undefined ? undefined : theme.radius + "px",
  };
}
