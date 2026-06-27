import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";
import { isAppHost } from "./lib/app-host";

// Next.js 16 renamed Middleware to Proxy; it now runs in the Node.js runtime.
// Two responsibilities:
//   1. Host routing — requests to the generated-apps sub-zone
//      (<label>.apps.<APPS_DOMAIN>) are rewritten to the internal /_serve route
//      that renders a project's VFS. These never touch builder auth.
//   2. Builder auth — on the main domain, protect the /app area (mirrors the
//      `authorized` callback, which `auth(fn)` does not invoke automatically).

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const host = req.headers.get("host");
  const appsDomain = process.env.APPS_DOMAIN;

  if (isAppHost(host, appsDomain)) {
    const { pathname } = req.nextUrl;
    // Forward the real app host explicitly. NextResponse.rewrite re-derives the
    // request's host from req.nextUrl (the internal/connection host, e.g.
    // 127.0.0.1:3000), so after the rewrite the /serve route would no longer see
    // the preview-<id>.apps.<domain> Host header it needs to resolve the project
    // — it 404s. We pin the original host on a header the route trusts. Set it on
    // every app-zone request (overwriting any client-supplied value) so it can't
    // be spoofed on the pass-through paths either.
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-app-host", host ?? "");
    // The rewrite pins pathname to /serve, so the real requested path (e.g.
    // /assets/logo.png for a multi-file app) is forwarded on a header the serve
    // route reads to resolve which VFS file to return.
    requestHeaders.set("x-app-path", pathname);

    // Let the app's own data/auth API and Next internals through untouched;
    // everything else on this origin is the generated app itself.
    if (
      pathname.startsWith("/api/") ||
      pathname === "/serve" ||
      pathname.startsWith("/_next")
    ) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/serve"; // query (the preview token) is preserved
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }

  // Builder / main domain.
  if (req.nextUrl.pathname.startsWith("/app") && !req.auth) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
