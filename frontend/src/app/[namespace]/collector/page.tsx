import { notFound } from "next/navigation";
import { isNamespace } from "@/lib/contracts";
import { requireSession } from "@/lib/session";
import { CollectorApp } from "@/features/collector/collector";

export const metadata = { title: "Data collector · SciProspect" };

/** The research collector app (its own sidebar), for workspace owners. Team members have no collector. */
export default async function Page({params}: {params: Promise<{namespace: string}>}) {
  const {namespace} = await params;
  if (!isNamespace(namespace) || namespace === "conference") notFound();
  const user = await requireSession(namespace);
  return <CollectorApp namespace={namespace} userName={user.client_name} tier={user.tier ?? ""} />;
}
