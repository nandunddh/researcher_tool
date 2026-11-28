import { requireWorkspace } from "@/lib/session";
import { StudioDashboard } from "@/features/studio/dashboard";

export default async function Page() {
  const user = await requireWorkspace("/scistudio");
  if (!user.is_admin && user.scistudio_access === false) return <main className="error-page"><h1>SciStudio access is unavailable.</h1><p>Ask the account owner to turn it on for you.</p><a href="/dashboard">Go to dashboard</a></main>;
  return <StudioDashboard namespace={user.workspace_namespace} user={user} />;
}
