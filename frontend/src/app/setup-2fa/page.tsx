import { redirect } from "next/navigation";
import { session } from "@/lib/session";
import { SetupTwoStep } from "@/features/auth/setup-two-step";

export const metadata = { title: "Protect your account · SciProspect", robots: { index: false } };

export default async function Page() {
  const current = await session();
  if (!current) redirect("/login");
  const workspace = `/${current.user.workspace_namespace}/dashboard`;
  if (!current.user.mfa_setup_required) redirect(workspace);
  return <SetupTwoStep workspace={workspace} email={current.user.client_email} />;
}
