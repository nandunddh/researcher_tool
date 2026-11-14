import { requireSession } from "@/lib/session";
import { ClientDashboard } from "@/features/client/dashboard";

export default async function Page() {
  await requireSession("client");
  return <ClientDashboard />;
}
