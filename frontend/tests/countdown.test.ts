import { test } from "node:test";
import assert from "node:assert/strict";
import { componentCatalog } from "../src/features/studio/component-catalog";
import { instantiateComponent } from "../src/features/studio/component-instance";
import { sectionRegistry } from "../src/features/studio/section-registry";
import { longDate, mapLink, parseDay, remaining } from "../src/features/studio/countdown";

test("only real calendar dates are accepted", () => {
  assert.equal(parseDay("2027-10-14"), Date.UTC(2027, 9, 14));
  assert.equal(parseDay(" 2028-02-29 "), Date.UTC(2028, 1, 29), "leap day");
  for (const bad of ["2027-02-29", "2027-13-01", "2027-00-10", "14/10/2027", "tomorrow", "", undefined, 20271014, "2027-1-4", "2027-10-14T10:00"]) {
    assert.equal(parseDay(bad), null, String(bad));
  }
});

test("time left is split into days, hours, minutes and seconds and ends at the date", () => {
  const target = Date.UTC(2027, 9, 14);
  assert.deepEqual(remaining(target, target - ((2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000)), { days: 2, hours: 3, minutes: 4, seconds: 5 });
  assert.deepEqual(remaining(target, target - 999), null, "under one second counts as reached");
  assert.equal(remaining(target, target), null);
  assert.equal(remaining(target, target + 5000), null, "after the date");
  assert.equal(remaining(target, Number.NaN), null);
});

test("dates read the same for every visitor, and map links are safe", () => {
  assert.equal(longDate(Date.UTC(2027, 9, 14)), "14 October 2027");
  assert.equal(longDate(Date.UTC(2027, 0, 1)), "1 January 2027");
  assert.equal(mapLink("", "  "), null);
  assert.equal(mapLink("Hall A", "1 Main St\n  Town"), "https://www.openstreetmap.org/search?query=Hall%20A%2C%201%20Main%20St%20Town");
  assert.ok(!mapLink("a&b=c#x", "?")!.includes("#x"), "special characters stay inside the query");
});

test("countdown and venue blocks are editable and start in a safe state", () => {
  const countdown = sectionRegistry.countdown, venue = sectionRegistry.venue;
  assert.deepEqual(countdown.fields.map(f => f.key), ["date", "done_text"]);
  assert.deepEqual(venue.fields.map(f => f.key), ["source", "name", "address", "image", "details"]);
  const c = instantiateComponent(componentCatalog.find(x => x.id === "countdown-event")!, "Brand");
  assert.equal(c.type, "countdown");
  assert.equal(parseDay(c.data.date), null, "no made-up event date: it follows Event details until the organiser picks one");
  assert.ok(String(c.data.done_text).trim());
  const v = instantiateComponent(componentCatalog.find(x => x.id === "venue-map")!, "Brand");
  assert.equal(v.type, "venue");
  assert.equal(v.data.source, "event", "written once in Event details by default");
  assert.ok((venue.fields.find(f => f.key === "source")!.options ?? []).some(([value]) => value === v.data.source));
});
