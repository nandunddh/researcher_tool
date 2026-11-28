import { requireSession } from "@/lib/session";
import { DemoRequests } from "@/features/admin/demo-requests";

export const metadata = { title: "Demo requests · SciProspect" };

export default async function Page() {
  await requireSession("root", "/root/demo-requests");
  return <DemoRequests />;
}
