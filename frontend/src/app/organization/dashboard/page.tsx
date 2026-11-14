import { requireSession } from "@/lib/session";
import { OrgDashboard } from "@/features/organization/dashboard";

export default async function Page() {
  await requireSession("organization");
  return <OrgDashboard />;
}
