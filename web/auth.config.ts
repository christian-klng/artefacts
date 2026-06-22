import type { NextAuthConfig } from "next-auth";

// Edge-safe Auth.js configuration. This file must NOT import the database
// client or bcrypt (they are not edge-compatible) so it can be used inside
// `proxy.ts`, which runs in the edge runtime. The Credentials provider — which
// needs Node APIs — is added in `auth.ts`.
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [],
  session: { strategy: "jwt" },
  callbacks: {
    // Route protection used by the proxy (middleware). Only the /app area
    // requires authentication; everything else is public.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnApp = nextUrl.pathname.startsWith("/app");
      if (isOnApp) return isLoggedIn;
      return true;
    },
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
