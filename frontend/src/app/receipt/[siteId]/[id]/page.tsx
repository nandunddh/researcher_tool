import { Receipt } from "@/features/studio/receipt";

export const metadata = { title: "Receipt", robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ siteId: string; id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { siteId, id } = await params;
  return <Receipt siteId={siteId} id={id} token={(await searchParams).t ?? ""} />;
}
