import { notFound, redirect } from "next/navigation";
import { isNamespace } from "@/lib/contracts";

/** The collector lives on the dashboard; old /…/collector links land there. */
export default async function Page({params}: {params: Promise<{namespace: string}>}) {
  const {namespace} = await params;
  if (!isNamespace(namespace) || namespace === "conference") notFound();
  redirect(`/${namespace}/dashboard#collector`);
}
