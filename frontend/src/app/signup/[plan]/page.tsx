import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { session } from "@/lib/session";
import { Signup } from "@/features/auth/signup";

export const metadata: Metadata = { title: "Create your account · SciProspect" };

/** /signup/business: sign-up with that plan already chosen. */
export default async function Page({ params }: { params: Promise<{ plan: string }> }) {
  const plan = (await params).plan;
  const current = await session();
  if (current) redirect(plan !== "free" && plan !== "trial" ?`/billing/upgrade/${encodeURIComponent(plan)}` : `/${current.user.workspace_namespace}/dashboard`);
  return <Signup initialPlan={plan} />;
}
