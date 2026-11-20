export const imageTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
export const maxImageBytes = 5 * 1024 * 1024;

/** Checks a picked file before upload. Returns a message for the user, or null. */
export function imageProblem(file: { type: string; size: number }): string | null {
  if (!(imageTypes as readonly string[]).includes(file.type)) return "Choose a PNG, JPG, WebP or GIF image.";
  if (file.size > maxImageBytes) return "This image is larger than 5 MB. Choose a smaller image.";
  if (file.size === 0) return "This file is empty.";
  return null;
}

export async function uploadImage(siteId: string, file: File): Promise<string> {
  const problem = imageProblem(file);
  if (problem) throw new Error(problem);
  const response = await fetch(`/api/builder/sites/${encodeURIComponent(siteId)}/media`, {
    method: "POST",
    body: file,
    headers: { "Content-Type": file.type },
    credentials: "same-origin",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.url !== "string") {
    throw new Error(typeof body?.detail === "string" ? body.detail : "The image could not be uploaded. Please try again.");
  }
  return body.url;
}
