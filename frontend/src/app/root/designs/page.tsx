import { requireSession } from "@/lib/session";
import { DesignLibrary } from "@/features/admin/design-library";
export default async function Page(){await requireSession("root");return <DesignLibrary/>}
