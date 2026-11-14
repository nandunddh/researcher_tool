import { requireSession } from "@/lib/session";
import { AddAccount } from "@/features/admin/add-account";
export default async function Page(){await requireSession("root");return <AddAccount/>}
