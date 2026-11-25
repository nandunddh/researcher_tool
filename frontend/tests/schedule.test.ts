import { test } from "node:test";
import assert from "node:assert/strict";
import { componentCatalog } from "../src/features/studio/component-catalog";
import { instantiateComponent } from "../src/features/studio/component-instance";
import { sectionRegistry } from "../src/features/studio/section-registry";
import { groupByDay } from "../src/features/studio/schedule";

const s = (day: unknown, title: string) => ({ day, title });

test("sessions are grouped by day in the order the organiser wrote them", () => {
  const groups = groupByDay([s("Day 2", "d"), s("Day 1", "a"), s("Day 2", "e"), s(" Day 1 ", "b")]);
  assert.deepEqual(groups.map(g => g.day), ["Day 2", "Day 1"], "first appearance decides the order, spaces are ignored");
  assert.deepEqual(groups[0].sessions.map(x => x.index), [0, 2], "each session keeps its place in the saved list, so edits reach the right one");
  assert.deepEqual(groups[1].sessions.map(x => x.index), [1, 3]);
});

test("sessions without a day form one unnamed group, and bad data does not break it", () => {
  assert.deepEqual(groupByDay([]), []);
  const groups = groupByDay([s(undefined, "a"), s(7, "b"), s("", "c")]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].day, "");
  assert.equal(groups[0].sessions.length, 3);
});

test("the schedule block is editable and starts with two complete days", () => {
  const def = sectionRegistry.schedule;
  assert.ok(def.header && def.lists[0].key === "sessions" && def.lists[0].max >= 100);
  const keys = def.lists[0].fields.map(f => f.key);
  assert.deepEqual(keys, ["day", "time", "title", "speaker", "location", "track", "description"]);
  assert.deepEqual(Object.keys(def.lists[0].newItem()).sort(), [...keys].sort(), "a new session has every field");
  const item = componentCatalog.find(c => c.id === "schedule-days")!;
  const instance = instantiateComponent(item, "Brand");
  assert.equal(instance.type, "schedule");
  const sessions = instance.data.sessions as Record<string, string>[];
  assert.ok(sessions.every(x => x.day && x.time && x.title), "day, time and title on every starter session");
  assert.deepEqual(groupByDay(sessions).map(g => g.day), ["Day 1", "Day 2"]);
});
