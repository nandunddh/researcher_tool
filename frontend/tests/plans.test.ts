import { test } from "node:test";
import assert from "node:assert/strict";
import { cardLines, planLines, priceFor, usd, yearlySaving, type PublicPlan } from "../src/lib/plans";

const basic: PublicPlan = { id: "basic", name: "Basic", price_month: 39, price_year: 390, kind: "paid",
  limits: { websites: 3, pages: 5, members: 1, storage_mb: 4000, data_storage_mb: 10000, submissions_month: -1, custom_domain: false, daily_contacts: 3000 } };
const trial: PublicPlan = { ...basic, id: "trial", name: "Free trial", kind: "trial", price_month: 0, price_year: 0,
  limits: { ...basic.limits, members: 0, websites: 1, daily_contacts: 1000 } };
const custom: PublicPlan = { ...basic, id: "custom", name: "Custom", kind: "custom", price_month: 0, price_year: 0 };

test("prices follow the billing period and annual saves two months", () => {
  assert.equal(priceFor(basic, "month"), 39);
  assert.equal(priceFor(basic, "year"), 390);
  assert.equal(yearlySaving(basic), 78);
  assert.equal(usd(1990), "$1,990");
  assert.equal(usd(32.5), "$32.50");
});

test("card lines are the short list: users, contacts per user, websites", () => {
  assert.deepEqual(cardLines(basic), ["2 users", "3,000 contacts per user per day", "3 websites · 5 pages each"]);
  assert.equal(cardLines(trial)[0], "1 user", "singular for one user");
  assert.equal(cardLines(trial)[2], "1 website · 5 pages each");
  assert.ok(cardLines(custom)[0].includes("by agreement"));
});

test("the full list adds storage, form submissions and the publishing address", () => {
  const lines = planLines(basic);
  assert.ok(lines.includes("4 GB file storage") && lines.includes("10 GB data storage"));
  assert.ok(lines.includes("Unlimited form submissions"));
  assert.ok(lines.includes("SciProspect subdomain"), "no custom domain on Basic");
  assert.ok(planLines({ ...basic, limits: { ...basic.limits, custom_domain: true } }).includes("Your own domain"));
  assert.equal(cardLines({ ...basic, limits: { ...basic.limits, members: -1, daily_contacts: -1 } })[0], "Unlimited users");
});
