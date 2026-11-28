import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/session";
import { EditorLibrary } from "@/features/studio/editor-library";

export default async function Page() {
  const user = await requireWorkspace("/scistudio/library");
  if (!user.scistudio_access && !user.is_admin) notFound();
  return <EditorLibrary />;
}
