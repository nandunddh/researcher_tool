import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/session";
import { BadgeMaker } from "@/features/badges/badge-maker";

export const metadata = { title: "Name badges · SciStudio" };

export default async function Page({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const user = await requireWorkspace(`/scistudio/${encodeURIComponent(siteId)}/badges`);
  if (!user.is_admin && user.scistudio_access === false) notFound();
  return <BadgeMaker siteId={siteId} backHref="/scistudio" />;
}
