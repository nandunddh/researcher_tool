/** Badge designs: every look is one plain object (saved with the website's Event details), and templates are starting points. */
import { FONT_STACKS, safeImage } from "@/features/studio/site-schema";
import { ROLE_COLORS, ROLES } from "./badges";

export const LINES = ["name", "organization", "detail"] as const;
export type Line = (typeof LINES)[number];
export const SIZE_KEYS = ["title", "subtitle", "name", "organization", "detail", "role"] as const;
export type SizeKey = (typeof SIZE_KEYS)[number];
export const SHOW_KEYS = ["title", "subtitle", "logo", "photo", "organization", "detail", "role", "qr", "sponsors"] as const;
export type ShowKey = (typeof SHOW_KEYS)[number];

export const CHOICES = {
  fill: [["white", "Plain"], ["role", "Role colour"]],
  header: [["gradient", "Gradient"], ["solid", "Solid"], ["plain", "None"]],
  band: [["bottom", "Band"], ["line", "Top line"], ["none", "Pill"]],
  align: [["center", "Centre"], ["left", "Left"]],
  qr: [["corner", "Corner"], ["bottom", "Bottom"]],
  photo: [["circle", "Circle"], ["square", "Square"], ["large", "Large"]],
} as const satisfies Record<string, readonly (readonly [string, string])[]>;
type Choice<K extends keyof typeof CHOICES> = (typeof CHOICES)[K][number][0];

export type BadgeDesign = {
  template: string;
  title: string; subtitle: string;
  fill: Choice<"fill">; header: Choice<"header">; band: Choice<"band">; align: Choice<"align">; qr: Choice<"qr">; photo: Choice<"photo">;
  colors: { background: string; text: string; muted: string; header: string; headerText: string };
  roleColors: Record<string, string>;
  labels: Record<string, string>;
  fonts: { heading: string; body: string };
  sizes: Record<SizeKey, number>;
  show: Record<ShowKey, boolean>;
  order: Line[];
  logo: string; backgroundImage: string;
};

export const SIZE_RANGE = { min: 60, max: 160 } as const;

/** The original look; every template starts from it. An empty header colour means "use the person's role colour". */
export const DEFAULT_DESIGN: BadgeDesign = {
  template: "classic", title: "", subtitle: "",
  fill: "white", header: "gradient", band: "bottom", align: "center", qr: "corner", photo: "circle",
  colors: { background: "#ffffff", text: "#18223b", muted: "#475569", header: "", headerText: "#ffffff" },
  roleColors: { ...ROLE_COLORS }, labels: Object.fromEntries(ROLES.map(r => [r, r])),
  fonts: { heading: "modern", body: "modern" },
  sizes: { title: 100, subtitle: 100, name: 100, organization: 100, detail: 100, role: 100 },
  show: { title: true, subtitle: true, logo: true, photo: true, organization: true, detail: true, role: true, qr: true, sponsors: false },
  order: ["name", "organization", "detail"], logo: "", backgroundImage: "",
};

type Patch = Partial<Omit<BadgeDesign, "colors" | "sizes" | "show" | "fonts">> & { colors?: Partial<BadgeDesign["colors"]>; sizes?: Partial<BadgeDesign["sizes"]>; show?: Partial<BadgeDesign["show"]>; fonts?: Partial<BadgeDesign["fonts"]> };
const merge = (base: BadgeDesign, patch: Patch): BadgeDesign => ({
  ...base, ...patch,
  colors: { ...base.colors, ...patch.colors }, sizes: { ...base.sizes, ...patch.sizes }, show: { ...base.show, ...patch.show }, fonts: { ...base.fonts, ...patch.fonts },
  roleColors: { ...base.roleColors, ...patch.roleColors }, labels: { ...base.labels, ...patch.labels }, order: [...(patch.order ?? base.order)],
});

export const TEMPLATES: { id: string; name: string; description: string; patch: Patch }[] = [
  { id: "classic", name: "Classic", description: "Colour header, large name and a role band.", patch: {} },
  { id: "minimal", name: "Minimal", description: "White, quiet type, a thin role line at the top.", patch: { header: "plain", band: "line", colors: { headerText: "#18223b" }, sizes: { name: 110 } } },
  { id: "bold", name: "Bold", description: "The whole badge in the role colour, white type.", patch: { fill: "role", header: "plain", band: "none", colors: { text: "#ffffff", muted: "#e2e8f0", headerText: "#ffffff" }, sizes: { name: 115 } } },
  { id: "photo", name: "Photo", description: "A large picture of the person above the name.", patch: { header: "solid", photo: "large", sizes: { name: 92 } } },
  { id: "night", name: "Night", description: "Dark background with a bright role line.", patch: { header: "plain", band: "line", colors: { background: "#0b1220", text: "#f8fafc", muted: "#94a3b8", headerText: "#f8fafc" } } },
  { id: "lanyard", name: "Lanyard", description: "An extra-large name and the QR code at the bottom.", patch: { header: "solid", qr: "bottom", sizes: { name: 135, organization: 110 }, show: { detail: false } } },
  { id: "elegant", name: "Elegant", description: "Serif type on warm paper, aligned left.", patch: { header: "plain", band: "line", align: "left", fonts: { heading: "elegant", body: "classic" }, colors: { background: "#fbf7f0", text: "#2b2118", muted: "#6b5a4a", headerText: "#2b2118" } } },
  { id: "blank", name: "Blank", description: "Plain white with everything off but the name. Build your own.", patch: { header: "plain", band: "none", qr: "corner", colors: { headerText: "#18223b" }, show: { title: true, subtitle: false, logo: false, photo: false, organization: true, detail: false, role: false, qr: false, sponsors: false } } },
];

/** A template's design, keeping the texts and pictures the organiser already set. */
export function applyTemplate(id: string, keep?: Pick<BadgeDesign, "title" | "subtitle" | "logo" | "backgroundImage" | "labels" | "roleColors">): BadgeDesign {
  const template = TEMPLATES.find(t => t.id === id) ?? TEMPLATES[0];
  const design = merge(DEFAULT_DESIGN, { ...template.patch, template: template.id });
  return keep ? { ...design, title: keep.title, subtitle: keep.subtitle, logo: keep.logo, backgroundImage: keep.backgroundImage, labels: { ...design.labels, ...keep.labels }, roleColors: { ...design.roleColors, ...keep.roleColors } } : design;
}

// ---------------------------------------------------------------- validation (saved designs come from the database)
const HEX = /^#[0-9a-f]{6}$/i;
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {});
const pick = <K extends keyof typeof CHOICES>(key: K, v: unknown, fallback: Choice<K>): Choice<K> =>
  (CHOICES[key] as readonly (readonly [string, string])[]).some(([value]) => value === v) ? v as Choice<K> : fallback;
const color = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : fallback);
const words = (v: unknown, max: number, fallback = "") => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : fallback);

/** A safe, complete design from anything stored: unknown keys are dropped and every value is checked or replaced. */
export function cleanDesign(raw: unknown): BadgeDesign {
  const r = rec(raw), d = DEFAULT_DESIGN;
  const colors = rec(r.colors), sizes = rec(r.sizes), show = rec(r.show), fonts = rec(r.fonts), roleColors = rec(r.roleColors), labels = rec(r.labels);
  const order = Array.isArray(r.order) ? r.order.filter((x): x is Line => (LINES as readonly string[]).includes(x as string)) : [];
  return {
    template: TEMPLATES.some(t => t.id === r.template) ? r.template as string : "custom",
    title: words(r.title, 80), subtitle: words(r.subtitle, 120),
    fill: pick("fill", r.fill, d.fill), header: pick("header", r.header, d.header), band: pick("band", r.band, d.band),
    align: pick("align", r.align, d.align), qr: pick("qr", r.qr, d.qr), photo: pick("photo", r.photo, d.photo),
    colors: { background: color(colors.background, d.colors.background), text: color(colors.text, d.colors.text), muted: color(colors.muted, d.colors.muted),
      header: colors.header === "" ? "" : color(colors.header, d.colors.header), headerText: color(colors.headerText, d.colors.headerText) },
    roleColors: Object.fromEntries(ROLES.map(role => [role, color(roleColors[role], d.roleColors[role])])),
    labels: Object.fromEntries(ROLES.map(role => [role, words(labels[role], 30) || role])),
    fonts: { heading: Object.hasOwn(FONT_STACKS, fonts.heading as string) ? fonts.heading as string : d.fonts.heading, body: Object.hasOwn(FONT_STACKS, fonts.body as string) ? fonts.body as string : d.fonts.body },
    sizes: Object.fromEntries(SIZE_KEYS.map(k => [k, typeof sizes[k] === "number" && Number.isFinite(sizes[k]) ? Math.round(Math.min(SIZE_RANGE.max, Math.max(SIZE_RANGE.min, sizes[k] as number))) : d.sizes[k]])) as BadgeDesign["sizes"],
    show: Object.fromEntries(SHOW_KEYS.map(k => [k, typeof show[k] === "boolean" ? show[k] : d.show[k]])) as BadgeDesign["show"],
    // Every line appears exactly once: saved order first, then any missing line in the default order.
    order: [...new Set([...order, ...d.order])],
    logo: safeImage(r.logo) ?? "", backgroundImage: safeImage(r.backgroundImage) ?? "",
  };
}

/** Moves one body line up (-1) or down (+1). */
export function moveLine(order: Line[], line: Line, delta: -1 | 1): Line[] {
  const next = [...order], i = next.indexOf(line), j = i + delta;
  if (i < 0 || j < 0 || j >= next.length) return order;
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
