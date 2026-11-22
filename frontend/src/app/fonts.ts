import { Bricolage_Grotesque, Geist } from "next/font/google";

/** Self-hosted by Next (no request to Google at runtime). Used by the public site, sign-in and billing. */
export const displayFont = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-display", display: "swap" });
export const bodyFont = Geist({ subsets: ["latin"], variable: "--font-body", display: "swap" });
