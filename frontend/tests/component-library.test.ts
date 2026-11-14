import { test } from "node:test";
import assert from "node:assert/strict";
import { componentCatalog,filterComponents } from "../src/features/studio/component-catalog";
test("library levels are cumulative and all designs remain browsable",()=>{assert.equal(filterComponents("basic","","Sections","Navigation").length,2);assert.equal(filterComponents("medium","","Sections","Navigation").length,3);assert.equal(filterComponents("pro","","Sections","Navigation").length,5);assert.equal(filterComponents("all","","Sections","Navigation").length,5)});
test("catalog IDs are unique and search combines with level",()=>{assert.equal(new Set(componentCatalog.map(c=>c.id)).size,componentCatalog.length);assert.equal(filterComponents("all"," MEGA MENU ").length,1);assert.equal(filterComponents("basic","mega menu").length,0)});

test("library groups and categories stay isolated",()=>{for(const group of ["Sections","Elements","Assets"] as const){const items=filterComponents("all","",group);assert.ok(items.length>0);assert.ok(items.every(c=>c.group===group))}assert.equal(filterComponents("all","","Elements","Buttons").length,1);assert.equal(filterComponents("all","","Assets","Navigation").length,0)});
