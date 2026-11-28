import { Notifications } from "@/components/notifications";
import type { Metadata } from "next";
import "./globals.css";
import { bodyFont, displayFont } from "./fonts";
import { siteUrl } from "@/lib/site-url";

const DESCRIPTION = "Collect verified researcher contacts and build your conference website with registration, abstracts and payments.";

/** Site-wide defaults; pages set their own title and description. The base address is worked out per request (see site-url.ts). */
export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(await siteUrl()),
    title: "SciProspect — Research workspace",
    description: DESCRIPTION,
    applicationName: "SciProspect",
    // The preview image comes from app/opengraph-image.tsx and app/twitter-image.tsx.
    openGraph: { type: "website", siteName: "SciProspect", title: "SciProspect", description: DESCRIPTION },
    twitter: { card: "summary_large_image", title: "SciProspect", description: DESCRIPTION },
    icons: {
      icon: [{ url: "/branding/sciprospect-a-favicon.png", sizes: "32x32", type: "image/png" }, { url: "/branding/sciprospect-a-favicon-64.png", sizes: "64x64", type: "image/png" }],
      apple: [{ url: "/branding/sciprospect-a-apple.png", sizes: "180x180", type: "image/png" }],
    },
  };
}

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}><body>{children}<Notifications/></body></html>;
}
