import { redirect } from "next/navigation";
import { session } from "@/lib/session";
import { Billing } from "@/features/billing/billing";

export const metadata = { title: "Billing · SciProspect" };

export default async function Page() {
  const current = await session();
  if (!current) redirect("/login");
  if (current.user.mfa_setup_required) redirect("/setup-2fa");
  return <Billing highlight="" workspace={`/${current.user.workspace_namespace}/dashboard`} />;
}
