import { AuthForm } from "@/components/auth-form";
import { authenticate } from "@/app/actions/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : undefined;
  return <AuthForm mode="login" action={authenticate} next={safeNext} />;
}
