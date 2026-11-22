import { notFound } from "next/navigation";
import { isNamespace } from "@/lib/contracts";
import { requireSession } from "@/lib/session";
import { Collector } from "@/features/collector/collector";

export default async function Page({params}: {params: Promise<{namespace: string}>}) {
  const {namespace} = await params;
  if (!isNamespace(namespace) || namespace === "conference") notFound();
  await requireSession(namespace);
  return <Collector namespace={namespace} />;
}
