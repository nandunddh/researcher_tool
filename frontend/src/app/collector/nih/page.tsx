import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/session";
import { CollectorApp } from "@/features/collector/collector";

export const metadata = { title: "NIH Grant PIs · SciProspect" };

/** The collector's NIH Grant PIs page: funded principal investigators from NIH RePORTER. */
export default async function Page() {
  const user = await requireWorkspace("/collector/nih");
  if (user.workspace_namespace === "conference") notFound();
  return <CollectorApp namespace={user.workspace_namespace} userName={user.client_name} tier={user.tier ?? ""} kind="nih" />;
}
