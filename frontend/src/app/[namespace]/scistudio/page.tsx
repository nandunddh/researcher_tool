import { notFound } from "next/navigation";
import { isNamespace } from "@/lib/contracts";
import { requireSession } from "@/lib/session";
import { StudioDashboard } from "@/features/studio/dashboard";
export default async function Page({ params }: { params: Promise<{ namespace: string }> }) {
  const { namespace } = await params;
  if (!isNamespace(namespace)) notFound();
  const user = await requireSession(namespace);
  if (!user.is_admin && user.scistudio_access === false) return <main className="error-page"><h1>SciStudio access is unavailable.</h1><p>Ask the account owner to turn it on for you.</p><a href={`/${namespace}/dashboard`}>Go to dashboard</a></main>;
  return <StudioDashboard namespace={namespace} user={user} />;
}
