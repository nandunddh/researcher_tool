import { requireSession } from "@/lib/session";
import { RootDashboard } from "@/features/admin/dashboard";
export default async function Page() {
  await requireSession("root");
  return <RootDashboard />;
}
