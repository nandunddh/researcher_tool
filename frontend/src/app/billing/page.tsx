import { redirect } from "next/navigation";
import { session } from "@/lib/session";
import { Billing } from "@/features/billing/billing";

export const metadata = { title: "Billing · SciProspect" };

export default async function Page({ searchParams }: { searchParams: Promise<{ plan?: string; paid?: string }> }) {
  const current = await session();
  if (!current) redirect("/login?next=/billing");
  const { plan, paid } = await searchParams;
  return <Billing highlight={plan ?? ""} paid={paid === "1"} workspace={`/${current.user.workspace_namespace}/dashboard`} />;
}
