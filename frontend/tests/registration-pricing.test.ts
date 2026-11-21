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

import { registrationData } from "../src/features/studio/registration-pricing";

test("a form uses Event details and only the ticked items", () => {
  const event = { basics: { currency: "EUR" }, periods: data.periods,
    tickets: [{ id: "a", name: "A" }, { id: "b", name: "B" }], addons: [{ id: "x" }, { id: "y" }], discounts: [{ id: "d" }] };
  const form = registrationData({ ticket_ids: ["b"], btn_text: "Go" }, event);
  assert.deepEqual((form.categories as { id: string }[]).map(t => t.id), ["b"]);
  assert.equal((form.addons as unknown[]).length, 2, "nothing ticked yet = all");
  assert.equal(form.currency, "EUR");
  assert.equal(form.btn_text, "Go");
  const own = { categories: [{ id: "own" }] };
  assert.equal(registrationData(own, {}), own, "no tickets in Event details: form keeps its own data");
});

import { keyDates } from "../src/features/studio/registration-pricing";

test("key dates come from Event details in date order", () => {
  const event = { basics: { starts: "2027-06-10", ends: "" }, periods: data.periods, deadlines: [{ name: "Abstracts", date: "2027-02-01" }, { name: "Bad", date: "soon" }] };
  assert.deepEqual(keyDates(event, {}).map(x => x.name),
    ["Abstracts", "Early registration ends", "Standard registration ends", "Conference begins"], "sorted; invalid and empty dates skipped");
  assert.deepEqual(keyDates(event, { show_prices: false, show_event: false }).map(x => x.name), ["Abstracts"]);
  assert.deepEqual(keyDates(undefined, {}), []);
});
