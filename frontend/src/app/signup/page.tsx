import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { session } from "@/lib/session";
import { Signup } from "@/features/auth/signup";

export const metadata: Metadata = { title: "Create your account · SciProspect" };

export default async function Page({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const current = await session();
  const plan = (await searchParams).plan ?? "free";
  if (current) redirect(plan !== "free" ? `/billing/upgrade/${encodeURIComponent(plan)}` : "/dashboard");
  return <Signup initialPlan={plan} />;
}
