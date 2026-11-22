import { redirect } from "next/navigation";
import { session } from "@/lib/session";
import { InvoiceView } from "@/features/billing/billing";

export const metadata = { title: "Invoice · SciProspect", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const current = await session();
  if (!current) redirect("/login");
  if (current.user.mfa_setup_required) redirect("/setup-2fa");
  return <InvoiceView id={(await params).id} />;
}
