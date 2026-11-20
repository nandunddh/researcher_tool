import {notFound} from "next/navigation";
import {isNamespace} from "@/lib/contracts";
import {requireSession} from "@/lib/session";
import {ReactEditor} from "@/features/studio/react-editor";
export default async function Page({params}:{params:Promise<{namespace:string;siteId:string}>}){const {namespace,siteId}=await params;if(!isNamespace(namespace))notFound();const user=await requireSession(namespace);if(user.is_member||(!user.is_admin&&user.scistudio_access===false))notFound();return <ReactEditor namespace={namespace} siteId={siteId}/>;}
