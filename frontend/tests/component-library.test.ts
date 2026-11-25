import { test } from "node:test";
import assert from "node:assert/strict";
import { componentCatalog,filterComponents } from "../src/features/studio/component-catalog";
test("library levels are cumulative and all designs remain browsable", () => {
  const navigation = componentCatalog.filter(item => item.group === "Sections" && item.category === "Navigation");
  assert.deepEqual(filterComponents("basic", "", "Sections", "Navigation"), navigation.filter(item => item.level === "basic"));
  assert.deepEqual(filterComponents("medium", "", "Sections", "Navigation"), navigation.filter(item => item.level !== "pro"));
  assert.deepEqual(filterComponents("pro", "", "Sections", "Navigation"), navigation);
  assert.deepEqual(filterComponents("all", "", "Sections", "Navigation"), navigation);
  assert.ok(navigation.some(item => item.id === "modern-mega" && item.level === "pro"));
});
test("catalog IDs are unique and search combines with level",()=>{assert.equal(new Set(componentCatalog.map(c=>c.id)).size,componentCatalog.length);assert.equal(filterComponents("all"," NAVIGATION MENU ").length,1);assert.equal(filterComponents("basic","navigation menu").length,0)});

test("library groups and categories stay isolated",()=>{for(const group of ["Sections","Elements","Assets"] as const){const items=filterComponents("all","",group);assert.ok(items.length>0);assert.ok(items.every(c=>c.group===group))}assert.equal(filterComponents("all","","Elements","Buttons").length,1);assert.equal(filterComponents("all","","Assets","Navigation").length,0)});
