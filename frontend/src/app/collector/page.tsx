import { requireWorkspace } from "@/lib/session";
import { CollectorApp } from "@/features/collector/collector";

export const metadata = { title: "Data collector · SciProspect" };

/** The research collector app (its own sidebar). Team members use their organisation's workspace. */
export default async function Page() {
  const user = await requireWorkspace("/collector");
  return <CollectorApp namespace={user.workspace_namespace} userName={user.client_name} tier={user.tier ?? ""} />;
}
