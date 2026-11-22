import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";

/** Team members land on their organization's websites (SciStudio). */
export default async function Page() {
  await requireSession("conference");
  redirect("/conference/scistudio");
}
