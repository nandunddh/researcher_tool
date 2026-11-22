import { requireSession } from "@/lib/session";
import { PlansAdmin } from "@/features/admin/plans";
export default async function Page(){await requireSession("root");return <PlansAdmin/>}
