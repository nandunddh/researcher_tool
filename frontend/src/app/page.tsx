import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { session } from "@/lib/session";
import { safeReturnPath } from "@/lib/contracts";
import { Landing, type PublicPlan } from "@/features/marketing/landing";

export const metadata: Metadata = {
  title: "SciProspect · Researcher data and event websites",
  description: "Collect verified researcher contacts and build your conference website with registration, payments and abstract submissions. No code needed.",
};

async function loadPlans(): Promise<PublicPlan[]> {
  try {
    const origin = process.env.FASTAPI_ORIGIN || "http://127.0.0.1:8000";
    const response = await fetch(origin + "/api/public/plans", { cache: "no-store" });
    return response.ok ? (await response.json()).plans : [];
  } catch {
    return [];  // the page still works if the backend is down; pricing shows a short note
  }
}

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const current = await session();
  const next = safeReturnPath((await searchParams).next);
  // Sign-in redirects still pass through here with ?next=…
  if (next) redirect(current ? next : `/login?next=${encodeURIComponent(next)}`);
  return <Landing plans={await loadPlans()} signedInHref={current ? "/dashboard" : null} />;
}
