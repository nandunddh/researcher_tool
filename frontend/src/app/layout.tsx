import { Notifications } from "@/components/notifications";
import type { Metadata } from "next";
import "./globals.css";
import { bodyFont, displayFont } from "./fonts";
export const metadata: Metadata = {
  title: "SciProspect — Research workspace",
  description: "SciProspect and SciStudio",
  icons: {
    icon: [{ url: "/branding/sciprospect-a-favicon.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/branding/sciprospect-a-apple.png", sizes: "180x180", type: "image/png" }],
  },
};
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}><body>{children}<Notifications/></body></html>;
}
