import { redirect } from "next/navigation";
import { session } from "@/lib/session";
import { TestCheckout } from "@/features/billing/billing";

export const metadata = { title: "Checkout · SciProspect" };

export default async function Page({ params }: { params: Promise<{ sessionId: string }> }) {
  const current = await session();
  if (!current) redirect("/login");
  if (current.user.mfa_setup_required) redirect("/setup-2fa");
  return <TestCheckout sessionId={(await params).sessionId} />;
}
