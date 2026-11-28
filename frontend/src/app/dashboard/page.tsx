import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/session";
import { ClientDashboard } from "@/features/client/dashboard";
import { OrgDashboard } from "@/features/organization/dashboard";

export const metadata = { title: "Dashboard · SciProspect" };

/** One dashboard address for every account: the session's account type decides what it shows. */
export default async function Page() {
  const user = await requireWorkspace("/dashboard");
  if (user.workspace_namespace === "organization") return <OrgDashboard />;
  if (user.workspace_namespace === "client") return <ClientDashboard />;
  if (user.workspace_namespace === "root") redirect("/root/dashboard");  // the admin area keeps its own pages
  redirect("/scistudio");  // conference teams work in SciStudio
}
