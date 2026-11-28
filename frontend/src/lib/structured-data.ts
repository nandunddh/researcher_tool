import type { PublicPlan } from "./plans";

/** Schema.org data for search engines: who we are and what SciProspect costs (prices come from the live plans). */
export function homeStructuredData(base: string, plans: PublicPlan[]) {
  const prices = plans.filter((p) => p.kind === "paid" && p.price_month > 0).map((p) => p.price_month);
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": `${base}/#organization`, name: "SciProspect", url: `${base}/`, logo: `${base}/branding/sciprospect-a-icon-lime.png` },
      {
        "@type": "SoftwareApplication",
        name: "SciProspect",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: `${base}/`,
        description: "Collect verified researcher contacts and build conference websites with registration, abstracts and payments.",
        publisher: { "@id": `${base}/#organization` },
        ...(prices.length ? { offers: { "@type": "AggregateOffer", priceCurrency: "USD", lowPrice: Math.min(...prices), highPrice: Math.max(...prices), offerCount: prices.length } } : {}),
      },
    ],
  };
}

/** Schema.org data for /pricing: SciProspect as a product with one monthly offer per paid plan (from the live plans). */
export function pricingStructuredData(base: string, plans: PublicPlan[]) {
  const paid = plans.filter((p) => p.kind === "paid" && p.price_month > 0);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "SciProspect",
    description: "Researcher contact collection and conference website builder, with a 7-day free trial.",
    brand: { "@type": "Brand", name: "SciProspect" },
    url: `${base}/pricing`,
    offers: paid.map((p) => ({
      "@type": "Offer", name: p.name, price: p.price_month, priceCurrency: "USD", url: `${base}/pricing`,
      availability: "https://schema.org/InStock",
      priceSpecification: { "@type": "UnitPriceSpecification", price: p.price_month, priceCurrency: "USD", unitCode: "MON" },
    })),
  };
}

/** JSON for a <script type="application/ld+json">; "<" is escaped so text can never close the script tag. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
