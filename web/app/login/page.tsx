import { AuthForm } from "@/components/auth-form";
import { authenticate } from "@/app/actions/auth";

export default function LoginPage() {
  return <AuthForm mode="login" action={authenticate} />;
}
