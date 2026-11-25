import { notFound } from "next/navigation";
import { isNamespace } from "@/lib/contracts";
import { requireSession } from "@/lib/session";
import { CollectorApp } from "@/features/collector/collector";

export const metadata = { title: "Data collector · SciProspect" };

/** The research collector app (its own sidebar). Team members use their organisation's workspace. */
export default async function Page({params}: {params: Promise<{namespace: string}>}) {
  const {namespace} = await params;
  if (!isNamespace(namespace)) notFound();
  const user = await requireSession(namespace, `/${namespace}/collector`);
  return <CollectorApp namespace={namespace} userName={user.client_name} tier={user.tier ?? ""} />;
}
