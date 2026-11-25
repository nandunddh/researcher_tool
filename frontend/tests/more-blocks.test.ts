import { test } from "node:test";
import assert from "node:assert/strict";
import { componentCatalog } from "../src/features/studio/component-catalog";
import { instantiateComponent } from "../src/features/studio/component-instance";
import { sectionRegistry } from "../src/features/studio/section-registry";
import { videoEmbed } from "../src/features/studio/video";

const make = (id: string) => instantiateComponent(componentCatalog.find(c => c.id === id)!, "Summit");
const options = (type: string, key: string) => (sectionRegistry[type].fields.find(f => f.key === key)?.options ?? []).map(([value]) => value);

test("YouTube links become privacy-friendly embeds, with the start time kept", () => {
  const nocookie = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
  for (const url of ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ", "https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=x",
    "https://youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube.com/embed/dQw4w9WgXcQ", " https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ "]) {
    assert.deepEqual(videoEmbed(url), { provider: "youtube", src: nocookie }, url);
  }
  assert.equal(videoEmbed("https://youtu.be/dQw4w9WgXcQ?t=90")!.src, `${nocookie}?start=90`);
  assert.equal(videoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s")!.src, `${nocookie}?start=90`);
  assert.equal(videoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=soon")!.src, nocookie, "a bad time is ignored, not passed on");
});

test("Vimeo links become embeds without tracking", () => {
  for (const url of ["https://vimeo.com/76979871", "https://vimeo.com/channels/staffpicks/76979871", "https://player.vimeo.com/video/76979871"]) {
    assert.deepEqual(videoEmbed(url), { provider: "vimeo", src: "https://player.vimeo.com/video/76979871?dnt=1" }, url);
  }
});

test("anything else is refused, so the frame can only show YouTube or Vimeo", () => {
  for (const bad of ["", "   ", undefined, 42, "not a url", "javascript:alert(1)", "https://evil.example/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/watch?v=short", "https://www.youtube.com/watch?v=dQw4w9WgXcQ%22onload",
    "https://www.youtube.com/@channel", "https://vimeo.com/about", "ftp://vimeo.com/76979871", "https://player.vimeo.com/video/abc"]) {
    assert.equal(videoEmbed(bad), null, String(bad));
  }
});

test("card sections offer large numbers and quotes, and every card can have a link", () => {
  for (const type of ["about", "stats", "agenda", "sponsors", "testimonials", "announcement", "travel"]) {
    assert.deepEqual(options(type, "design"), ["grid", "list", "spotlight", "figures", "quotes"], type);
    const list = sectionRegistry[type].lists[0];
    assert.deepEqual(Object.keys(list.newItem()).sort(), list.fields.map(f => f.key).sort(), `${type}: a new card has every field`);
  }
  assert.deepEqual(options("sponsor_tiers", "design"), ["tiers", "strip"]);
});

test("each new entry starts in the layout its name promises, with nothing made up", () => {
  const stats = make("stats-figures");
  assert.deepEqual([stats.type, stats.data.design], ["stats", "figures"]);
  assert.ok((stats.data.items as { title: string; meta: string }[]).every(i => /^\d+$/.test(i.title) && i.meta));
  const quotes = make("testimonials-quotes");
  assert.deepEqual([quotes.type, quotes.data.design], ["testimonials", "quotes"]);
  assert.ok((quotes.data.items as { description: string }[]).every(i => /permission/.test(i.description)), "asks for a real, approved quote");
  const strip = make("logos-strip");
  assert.deepEqual([strip.type, strip.data.design], ["sponsor_tiers", "strip"]);
  const video = make("video-embed");
  assert.equal(video.type, "video");
  assert.equal(videoEmbed(video.data.url), null, "no made-up video");
  assert.ok(String(video.data.title).trim(), "an accessible title from the start");
  const downloads = make("downloads-list");
  assert.equal(downloads.type, "downloads");
  assert.ok((downloads.data.files as { label: string; url: string }[]).every(f => f.label && f.url === ""), "no made-up file links");
  const travel = make("travel-stay");
  assert.equal(travel.type, "travel");
  assert.ok((travel.data.items as { title: string; description: string }[]).every(i => i.title && i.description === ""), "no invented travel advice");
});
