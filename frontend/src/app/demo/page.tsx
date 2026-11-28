import type { Metadata } from "next";
import { BookDemo } from "@/features/marketing/book-demo";

export const metadata: Metadata = {
  title: "Book a demo · SciProspect",
  description: "See SciProspect with your own research topic and event in a 30-minute call with our team.",
};

export default function Page() {
  return <BookDemo />;
}
