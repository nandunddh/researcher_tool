import type { Metadata } from "next";
import { session } from "@/lib/session";
import type { PublicPlan } from "@/lib/plans";
import { PricingPage } from "@/features/marketing/pricing-page";
import { siteUrl } from "@/lib/site-url";
import { jsonLd, pricingStructuredData } from "@/lib/structured-data";

export const metadata: Metadata = {
  title: "Pricing · SciProspect",
  description: "Basic, Pro and Ultra plans with a 7-day free trial. Collect verified researcher contacts and build your conference website.",
  alternates: { canonical: "/pricing" },
};

async function loadPlans(): Promise<PublicPlan[]> {
  try {
    const origin = process.env.FASTAPI_ORIGIN || "http://127.0.0.1:8000";
    const response = await fetch(origin + "/api/public/plans", { cache: "no-store" });
    return response.ok ? (await response.json()).plans : [];
  } catch {
    return [];  // the page still renders; the pricing section shows a short note
  }
}

export default async function Page() {
  const current = await session();
  const [plans, base] = await Promise.all([loadPlans(), siteUrl()]);
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(pricingStructuredData(base, plans)) }} />
    <PricingPage plans={plans} signedInHref={current ? "/dashboard" : null} />
  </>;
}
