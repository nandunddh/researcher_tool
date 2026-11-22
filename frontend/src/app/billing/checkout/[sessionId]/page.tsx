import { redirect } from "next/navigation";
import { session } from "@/lib/session";
import { TestCheckout } from "@/features/billing/billing";

export const metadata = { title: "Checkout · SciProspect" };

export default async function Page({ params }: { params: Promise<{ sessionId: string }> }) {
  if (!(await session())) redirect("/login?next=/billing");
  return <TestCheckout sessionId={(await params).sessionId} />;
}
