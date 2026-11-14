import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { isNamespace } from "@/lib/contracts";
import { EditorLibrary } from "@/features/studio/editor-library";
export default async function Page({params}:{params:Promise<{namespace:string}>}){const {namespace}=await params;if(!isNamespace(namespace))notFound();const user=await requireSession(namespace);if(!user.scistudio_access&&!user.is_admin)notFound();return <EditorLibrary/>}
