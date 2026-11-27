import { test } from "node:test";
import assert from "node:assert/strict";
import { CHOICES, DEFAULT_DESIGN, LINES, SIZE_RANGE, TEMPLATES, applyTemplate, cleanDesign, moveLine } from "../src/features/badges/design";
import { ROLES } from "../src/features/badges/badges";
import { FONT_STACKS } from "../src/features/studio/site-schema";

test("every template is a complete, valid design that differs from the others", () => {
  assert.ok(TEMPLATES.length >= 8);
  assert.equal(new Set(TEMPLATES.map(t => t.id)).size, TEMPLATES.length);
  const looks = new Set<string>();
  for (const t of TEMPLATES) {
    const design = applyTemplate(t.id);
    assert.equal(design.template, t.id);
    assert.deepEqual(cleanDesign(design), design, `${t.id} survives saving unchanged`);
    assert.ok(t.name && t.description.endsWith("."), t.id);
    looks.add(JSON.stringify({ ...design, template: "" }));
  }
  assert.equal(looks.size, TEMPLATES.length, "no two templates look the same");
});

test("changing template keeps the organiser's texts, pictures, labels and role colours", () => {
  const mine = { ...applyTemplate("classic"), title: "QH 2027", subtitle: "Lisbon", logo: "/api/builder/media/site_x/logo.png", backgroundImage: "",
    labels: { ...DEFAULT_DESIGN.labels, Speaker: "Presenter" }, roleColors: { ...DEFAULT_DESIGN.roleColors, Speaker: "#000000" } };
  const night = applyTemplate("night", mine);
  assert.equal(night.template, "night");
  assert.equal(night.colors.background, "#0b1220");
  assert.deepEqual([night.title, night.subtitle, night.logo, night.labels.Speaker, night.roleColors.Speaker], ["QH 2027", "Lisbon", mine.logo, "Presenter", "#000000"]);
  assert.equal(applyTemplate("nope").template, "classic", "an unknown template falls back to Classic");
});

test("stored designs are cleaned: bad colours, fonts, sizes, choices and links are replaced", () => {
  const clean = cleanDesign({
    template: "<script>", title: "  A   very\nlong  ".repeat(30), fill: "neon", header: "solid", band: "line",
    colors: { background: "red", text: "#ABCDEF", header: "", headerText: "url(x)" },
    roleColors: { Speaker: "#123", Attendee: "#00ff00", Hacker: "#ffffff" }, labels: { Speaker: "  Presenter  ", Attendee: "", Evil: "x" },
    fonts: { heading: "constructor", body: "classic" }, sizes: { name: 999, title: -5, role: "big", detail: 87.6 },
    show: { qr: false, photo: "yes" }, order: ["detail", "evil", "detail", "name"],
    logo: "javascript:alert(1)", backgroundImage: "https://cdn.example.org/bg.jpg", extra: "dropped",
  });
  assert.equal(clean.template, "custom");
  assert.ok(clean.title.length <= 80 && !/\s{2}/.test(clean.title));
  assert.equal(clean.fill, "white");
  assert.equal(clean.header, "solid");
  assert.deepEqual(clean.colors, { background: "#ffffff", text: "#abcdef", muted: DEFAULT_DESIGN.colors.muted, header: "", headerText: "#ffffff" });
  assert.equal(clean.roleColors.Speaker, DEFAULT_DESIGN.roleColors.Speaker, "short hex is not accepted");
  assert.equal(clean.roleColors.Attendee, "#00ff00");
  assert.deepEqual(Object.keys(clean.roleColors).sort(), [...ROLES].sort(), "only known roles");
  assert.deepEqual([clean.labels.Speaker, clean.labels.Attendee], ["Presenter", "Attendee"]);
  assert.deepEqual(clean.fonts, { heading: "modern", body: "classic" });
  assert.deepEqual([clean.sizes.name, clean.sizes.title, clean.sizes.role, clean.sizes.detail], [SIZE_RANGE.max, SIZE_RANGE.min, 100, 88]);
  assert.deepEqual([clean.show.qr, clean.show.photo], [false, true]);
  assert.deepEqual(clean.order, ["detail", "name", "organization"], "each line once, saved order first");
  assert.equal(clean.logo, "");
  assert.ok(!("extra" in clean));
  for (const font of Object.values(clean.fonts)) assert.ok(Object.hasOwn(FONT_STACKS, font));
  assert.deepEqual(cleanDesign(null), { ...DEFAULT_DESIGN, template: "custom" });
});

test("every choice the panel offers is accepted by the cleaner", () => {
  for (const [key, options] of Object.entries(CHOICES)) {
    for (const [value] of options) assert.equal((cleanDesign({ [key]: value }) as unknown as Record<string, string>)[key], value, `${key}=${value}`);
  }
});

test("lines move up and down without getting lost", () => {
  assert.deepEqual(moveLine([...LINES], "organization", -1), ["organization", "name", "detail"]);
  assert.deepEqual(moveLine([...LINES], "detail", 1), [...LINES], "already last");
  assert.deepEqual(moveLine([...LINES], "name", -1), [...LINES], "already first");
});
