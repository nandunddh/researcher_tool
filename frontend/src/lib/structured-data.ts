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

/** JSON for a <script type="application/ld+json">; "<" is escaped so text can never close the script tag. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
