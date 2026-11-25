import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "src/features/studio/section-blocks.module.css"), "utf8");
const source = readFileSync(join(process.cwd(), "src/features/studio/section-blocks.tsx"), "utf8");
const block = (query: string) => {
  const start = css.lastIndexOf(`@container sci-site (${query})`);
  assert.ok(start >= 0, `missing ${query}`);
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  throw new Error("unclosed block");
};
const repeating = [".wrap .grid:not([data-design=list]):not([data-design=spotlight])", ".wrap .count", ".wrap .regTypes"];

test("tablets show two per row for every repeating layout", () => {
  const tablet = block("min-width: 641px) and (max-width: 1023px");
  for (const selector of [...repeating, ".wrap.nodes[data-cols=multi]"]) assert.ok(tablet.includes(selector), selector);
  assert.match(tablet, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(tablet, /\[data-span=wide\] \{ grid-column: 1 \/ -1 !important/, "blocks wider than two columns take a full row");
});

test("phones show one per row for every repeating layout", () => {
  const phone = block("max-width: 640px");
  for (const selector of [...repeating, ".wrap.nodes"]) assert.ok(phone.includes(selector), selector);
  assert.match(phone, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(phone, /\.wrap\.nodes > \* \{ grid-column: 1 \/ -1 !important/);
});

test("the shared rule comes after every layout rule it overrides", () => {
  const rule = css.lastIndexOf("One responsive rule for every repeating layout");
  for (const earlier of [".people[data-design=portraits] {", '.grid[data-count="4"]', ".grid[data-design=figures] {", ".count {", ".regTypes {"]) {
    assert.ok(css.indexOf(earlier) >= 0 && css.indexOf(earlier) < rule, earlier);
  }
});

test("content blocks tell the stylesheet which blocks are wide", () => {
  assert.match(source, /data-cols=\{columns > 1 \? "multi" : undefined\}/);
  assert.ok((source.match(/data-span=\{wide\}/g) ?? []).length >= 4, "every block kind carries its width");
});
