import { test } from "node:test";
import assert from "node:assert/strict";
import { currentPeriod, parsePrice, priceIn } from "../src/features/studio/registration-pricing";

const data = { periods: [{ id: "late", name: "Late", ends: "" }, { id: "std", name: "Standard", ends: "2027-05-31" }, { id: "early", name: "Early", ends: "2027-03-31" }] };

test("custom periods apply by date, open-ended last, then close", () => {
  assert.equal(currentPeriod(data, "2027-03-31")?.id, "early");
  assert.equal(currentPeriod(data, "2027-04-01")?.id, "std");
  assert.equal(currentPeriod(data, "2030-01-01")?.id, "late");
  assert.equal(currentPeriod({ periods: [{ id: "a", ends: "2027-01-01" }] }, "2027-01-02"), null);
  assert.equal(currentPeriod({}), null);
});

test("blank price means not offered; prices keep decimals", () => {
  const type = { prices: { early: 99.5, std: "", late: null } };
  assert.equal(priceIn(type, "early"), 99.5);
  assert.equal(priceIn(type, "std"), null);
  assert.equal(priceIn(type, "late"), null);
  assert.equal(priceIn(undefined, "early"), null);
  assert.equal(parsePrice(""), null);
  assert.equal(parsePrice("99."), 99);
  assert.equal(parsePrice("12,50"), 12.5);
  assert.equal(parsePrice("1.234"), undefined);
  assert.equal(parsePrice("-5"), undefined);
});
