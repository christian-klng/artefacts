import Link from "next/link";
import { ResetPasswordForm } from "@/components/reset-password-form";
import { resolveLocale } from "@/lib/locale";
import { getMessages } from "@/lib/i18n/messages";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    const t = getMessages(await resolveLocale()).auth;
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t.resetInvalidTitle}
        </h1>
        <p className="text-sm text-neutral-500">{t.resetInvalidBody}</p>
        <p className="text-sm text-neutral-500">
          <Link href="/forgot-password" className="underline">
            {t.requestNewLink}
          </Link>
        </p>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}
