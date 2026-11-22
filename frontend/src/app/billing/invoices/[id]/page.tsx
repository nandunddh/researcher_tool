import { redirect } from "next/navigation";
import { session } from "@/lib/session";
import { InvoiceView } from "@/features/billing/billing";

export const metadata = { title: "Invoice · SciProspect", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (!(await session())) redirect("/login?next=/billing");
  return <InvoiceView id={(await params).id} />;
}
