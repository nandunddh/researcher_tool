import { redirect } from "next/navigation";
import { session } from "@/lib/session";
import { Account } from "@/features/account/account";
import { ClientShell } from "@/features/client/shell";
import { OrgShell } from "@/features/organization/shell";

export const metadata = { title: "Account · SciProspect" };

/** Profile, plan, usage, security and billing for client and organization accounts. */
export default async function Page() {
  const current = await session();
  if (!current) redirect("/login?next=%2Faccount");
  if (current.user.mfa_setup_required) redirect("/setup-2fa");
  const ns = current.user.workspace_namespace;
  if (ns === "organization") return <OrgShell title="Account" path="/account"><Account namespace="organization" /></OrgShell>;
  if (ns === "client") return <ClientShell title="Account" clientName={current.user.client_name} path="/account"><Account namespace="client" /></ClientShell>;
  redirect("/dashboard"); // root and conference teams manage accounts elsewhere
}
