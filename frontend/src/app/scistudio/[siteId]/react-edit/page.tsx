import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/session";
import { ReactEditor } from "@/features/studio/react-editor";

export default async function Page({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const user = await requireWorkspace(`/scistudio/${encodeURIComponent(siteId)}/react-edit`);
  if (user.is_member || (!user.is_admin && user.scistudio_access === false)) notFound();
  return <ReactEditor namespace={user.workspace_namespace} siteId={siteId} />;
}
