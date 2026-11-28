import { notFound } from "next/navigation";
import { prepareSite } from "@/features/studio/editor-model";
import { PublishedSite } from "@/features/studio/published-site";

export default async function TemplatePreview({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const origin = process.env.FASTAPI_ORIGIN || "http://127.0.0.1:8000";
  // Templates change rarely (new ones come from the Design Library), so each preview is cached for 5 minutes.
  const response = await fetch(origin + "/api/builder/templates/" + encodeURIComponent(templateId), { next: { revalidate: 300 } });
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error("The template preview could not be loaded.");
  return <PublishedSite site={prepareSite(await response.json())} />;
}
