import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isNamespace, type Namespace, type Session } from "./contracts";

export async function session(): Promise<Session | null> {
  const token = (await cookies()).get("scip_token");
  if (!token) return null;
  const response = await fetch(`${process.env.FASTAPI_ORIGIN || "http://127.0.0.1:8000"}/api/auth/me`, {
    headers: { Cookie: `scip_token=${encodeURIComponent(token.value)}` },
    cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("The account service is unavailable. Please retry.");
  const data: Session = await response.json();
  if (!isNamespace(data.user?.workspace_namespace)) throw new Error("Restart FastAPI to load the frontend session contract.");
  return data;
}
export async function requireSession(namespace: Namespace) {
  const current = await session();
  if (!current) redirect(`/login?next=/${namespace}/scistudio`);
  if (current.user.mfa_setup_required) redirect("/setup-2fa");
  if (current.user.workspace_namespace !== namespace) redirect(`/${current.user.workspace_namespace}/dashboard`);
  return current.user;
}
