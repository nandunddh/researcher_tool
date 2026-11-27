import { notFound } from "next/navigation";
import { isNamespace } from "@/lib/contracts";
import { requireSession } from "@/lib/session";
import { BadgeMaker } from "@/features/badges/badge-maker";

export const metadata = { title: "Name badges · SciStudio" };

export default async function Page({ params }: { params: Promise<{ namespace: string; siteId: string }> }) {
  const { namespace, siteId } = await params;
  if (!isNamespace(namespace)) notFound();
  const user = await requireSession(namespace, `/${namespace}/scistudio/${encodeURIComponent(siteId)}/badges`);
  if (!user.is_admin && user.scistudio_access === false) notFound();
  return <BadgeMaker siteId={siteId} backHref={`/${namespace}/scistudio`} />;
}
