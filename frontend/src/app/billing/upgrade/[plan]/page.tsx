import { redirect } from "next/navigation";
import { session } from "@/lib/session";
import { Billing } from "@/features/billing/billing";

export const metadata = { title: "Choose your plan · SciProspect" };

/** /billing/upgrade/business: Billing with that plan highlighted (from the pricing page or sign-up). */
export default async function Page({ params }: { params: Promise<{ plan: string }> }) {
  const current = await session();
  if (!current) redirect("/login");
  if (current.user.mfa_setup_required) redirect("/setup-2fa");
  return <Billing highlight={(await params).plan} workspace={`/${current.user.workspace_namespace}/dashboard`} />;
}
