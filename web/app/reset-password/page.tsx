import Link from "next/link";
import { ResetPasswordForm } from "@/components/reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Invalid reset link
        </h1>
        <p className="text-sm text-neutral-500">
          This link is missing its token. Please request a new one.
        </p>
        <p className="text-sm text-neutral-500">
          <Link href="/forgot-password" className="underline">
            Request a new reset link
          </Link>
        </p>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}
