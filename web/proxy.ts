import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Next.js 16 renamed Middleware to Proxy. We run the edge-safe Auth.js config
// here to enforce the `authorized` callback (protects the /app area).
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
