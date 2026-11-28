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
/** Signed in, two-step set up and a live plan, or sent where that gets fixed. returnTo: where to come back after signing in. */
async function signedIn(returnTo: string) {
  const current = await session();
  if (!current) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  if (current.user.mfa_setup_required) redirect("/setup-2fa");
  if (current.user.license_expired) redirect("/billing");  // an ended trial or plan can only reach Billing
  return current.user;
}

/** Workspace pages (/dashboard, /collector, /scistudio …): any account type; the user's workspace_namespace says which. */
export async function requireWorkspace(returnTo: string) {
  return signedIn(returnTo);
}

/** Pages for one account type only (the root admin pages). */
export async function requireSession(namespace: Namespace, returnTo = "/dashboard") {
  const user = await signedIn(returnTo);
  if (user.workspace_namespace !== namespace) redirect("/dashboard");
  return user;
}
