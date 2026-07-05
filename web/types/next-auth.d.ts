import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      // UI language preference: 'de' | 'en', or null/undefined when unset.
      locale?: string | null;
    } & DefaultSession["user"];
  }

  // The object returned by the Credentials `authorize` callback.
  interface User {
    locale?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    locale?: string | null;
  }
}
