import { ResetPassword } from "@/features/auth/reset-password";

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return <ResetPassword token={(await searchParams).token ?? ""} />;
}
