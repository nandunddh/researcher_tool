import { test } from "node:test";
import assert from "node:assert/strict";
import { homeStructuredData, jsonLd, pricingStructuredData } from "../src/lib/structured-data";
import type { PublicPlan } from "../src/lib/plans";

const plan = (id: string, kind: string, price_month: number) => ({ id, name: id, kind, price_month, price_year: price_month * 10, limits: {}, featured: false }) as unknown as PublicPlan;

test("prices come from the paid plans only", () => {
  const data = homeStructuredData("https://sp.example", [plan("trial", "trial", 0), plan("basic", "paid", 39), plan("ultra", "paid", 199), plan("custom", "custom", 0)]);
  const app = data["@graph"][1] as Record<string, any>;
  assert.deepEqual(app.offers, { "@type": "AggregateOffer", priceCurrency: "USD", lowPrice: 39, highPrice: 199, offerCount: 2 });
  assert.equal((data["@graph"][0] as Record<string, any>).logo, "https://sp.example/branding/sciprospect-a-icon-lime.png");
});

test("no offers without paid plans, and script-closing text is escaped", () => {
  assert.equal("offers" in (homeStructuredData("https://x", [])["@graph"][1] as object), false);
  assert.equal(jsonLd({ a: "</script><b>" }).includes("</script>"), false);
});

test("the pricing page lists one monthly offer per paid plan", () => {
  const data = pricingStructuredData("https://sp.example", [plan("trial", "trial", 0), plan("basic", "paid", 39), plan("pro", "paid", 89), plan("custom", "custom", 0)]);
  assert.deepEqual(data.offers.map((o) => [o.name, o.price, o.priceSpecification.unitCode]), [["basic", 39, "MON"], ["pro", 89, "MON"]]);
  assert.equal(data.url, "https://sp.example/pricing");
});
