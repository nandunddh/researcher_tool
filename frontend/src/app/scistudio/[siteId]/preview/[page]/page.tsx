import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/session";
import { SitePreview } from "@/features/studio/site-preview";

export default async function Page({ params }: { params: Promise<{ siteId: string; page: string }> }) {
  const { siteId, page } = await params;
  const user = await requireWorkspace(`/scistudio/${encodeURIComponent(siteId)}/preview/${page}`);
  if (user.is_member || (!user.is_admin && user.scistudio_access === false)) notFound();
  return <SitePreview siteId={siteId} pageSlug={decodeURIComponent(page)} />;
}
