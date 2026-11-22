import { notFound } from "next/navigation";
import { isNamespace } from "@/lib/contracts";
import { requireSession } from "@/lib/session";
import { CollectorApp } from "@/features/collector/collector";

export const metadata = { title: "NIH Grant PIs · SciProspect" };

/** The collector's NIH Grant PIs page: funded principal investigators from NIH RePORTER. */
export default async function Page({params}: {params: Promise<{namespace: string}>}) {
  const {namespace} = await params;
  if (!isNamespace(namespace) || namespace === "conference") notFound();
  const user = await requireSession(namespace, `/${namespace}/collector/nih`);
  return <CollectorApp namespace={namespace} userName={user.client_name} tier={user.tier ?? ""} kind="nih" />;
}
