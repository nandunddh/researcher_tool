import { session } from "@/lib/session";
import { safeReturnPath } from "@/lib/contracts";
import { redirect } from "next/navigation";
import { Login } from "@/features/auth/login";
export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const current = await session();
  const next = safeReturnPath((await searchParams).next);
  if (current) redirect(next || "/dashboard");
  return <Login returnPath={next} />;
}
