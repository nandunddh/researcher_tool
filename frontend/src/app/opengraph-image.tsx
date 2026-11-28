import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The wide card shown when a SciProspect link is shared (pages without their own image use this one).
export const alt = "SciProspect: researcher contacts and conference websites";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const logo = await readFile(join(process.cwd(), "public/branding/sciprospect-a-icon-lime.png"));
  const src = `data:image/png;base64,${logo.toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#09090b", color: "#f4f4f5" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} width={88} height={88} alt="" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 50, fontWeight: 700, color: "#fff" }}>SciProspect</span>
            <span style={{ fontSize: 20, letterSpacing: 6, color: "#c8ff4d" }}>COLLECT &amp; STUDIO</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <span style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.02, color: "#fff", maxWidth: 980 }}>Find the researchers. Build the event website.</span>
          <span style={{ fontSize: 30, color: "#a1a1aa" }}>Verified contacts, registration, abstracts and payments in one place.</span>
        </div>
        <div style={{ display: "flex", height: 10, width: 220, borderRadius: 10, background: "#c8ff4d" }} />
      </div>
    ),
    size,
  );
}
