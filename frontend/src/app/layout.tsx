import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "SciProspect — Research workspace", description: "SciProspect and SciStudio" };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
