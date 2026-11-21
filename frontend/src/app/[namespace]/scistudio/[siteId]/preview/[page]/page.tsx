import { notFound } from "next/navigation";
import { isNamespace } from "@/lib/contracts";
import { requireSession } from "@/lib/session";
import { SitePreview } from "@/features/studio/site-preview";

export default async function Page({ params }: { params: Promise<{ namespace: string; siteId: string; page: string }> }) {
  const { namespace, siteId, page } = await params;
  if (!isNamespace(namespace)) notFound();
  const user = await requireSession(namespace);
  if (user.is_member || (!user.is_admin && user.scistudio_access === false)) notFound();
  return <SitePreview siteId={siteId} pageSlug={decodeURIComponent(page)} />;
}
