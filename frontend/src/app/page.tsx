import { session } from "@/lib/session";
import { safeReturnPath } from "@/lib/contracts";
import { redirect } from "next/navigation";
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const current = await session();
  const next = safeReturnPath((await searchParams).next);
  if (current) redirect(next || `/${current.user.workspace_namespace}/dashboard`);
  redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
}
