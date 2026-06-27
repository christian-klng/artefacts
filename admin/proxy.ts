import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_NAME, verifySession } from "./lib/auth";

// Next.js 16 renamed Middleware to Proxy. Gate the whole app behind the admin
// session cookie; only the login page and its server-action endpoints are public.
export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/login") {
    return NextResponse.next();
  }

  const session = await verifySession(req.cookies.get(COOKIE_NAME)?.value);
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and static assets. Server actions
  // POST to the page path they're defined on, so they're covered too — the
  // login action lives on /login, which is allowed above.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
