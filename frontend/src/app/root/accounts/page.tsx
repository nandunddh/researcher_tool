import { requireSession } from "@/lib/session";
import { ManageAccounts } from "@/features/admin/accounts";
export default async function Page(){await requireSession("root");return <ManageAccounts/>}
