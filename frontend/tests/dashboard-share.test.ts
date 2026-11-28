import { test } from "node:test";
import assert from "node:assert/strict";
import { share } from "../src/lib/plans";

test("progress bars show the share used, kept between empty and full", () => {
  assert.equal(share(250, 1000), 0.25);
  assert.equal(share(1500, 1000), 1);
  assert.equal(share(-5, 1000), 0);
  assert.equal(share(Number.NaN, 1000), 0);
});

test("no bar for unlimited or missing limits", () => {
  assert.equal(share(10, -1), null);
  assert.equal(share(10, 0), null);
  assert.equal(share(10, Number.NaN), null);
});
