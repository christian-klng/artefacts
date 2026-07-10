import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { publicOrigin } from "@/lib/base-url";
import { createProject } from "@/lib/projects";

// Universal, re-entrant handoff entry for the prompt that originates on the
// separate landing site (kubikraum.digital). The landing can't know whether the
// visitor is already logged into the builder (different origin), so it just
// sends the prompt here and this route decides what happens:
//
//   • not logged in        → stash the prompt in a short-lived HttpOnly cookie,
//                            send the visitor to /signup (URL stays clean). After
//                            auth, Auth.js redirects back here (redirectTo=/start)
//                            and we hit the "logged in + prompt" branch below.
//   • logged in + prompt    → create a NEW project and open it with ?run=1, which
//                            the workspace turns into the first agent message.
//   • logged in, no prompt  → just go to the workspace.
//
// Keeping the prompt in a cookie (not the URL) survives the signup detour and
// avoids leaking it into history/logs.

const COOKIE = "kk_pending_prompt";
const MAX_PROMPT = 1500;
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax",
  maxAge: 900, // 15 minutes
  path: "/",
} as const;

export async function GET(request: NextRequest) {
  const session = await auth();
  const url = request.nextUrl;
  // Build redirects on the canonical public origin, not request.nextUrl — the
  // deployed container binds HOSTNAME=0.0.0.0, so request.nextUrl would send the
  // browser to http://0.0.0.0:3000/… (see lib/base-url.ts).
  const origin = publicOrigin(url.origin);

  const fresh = url.searchParams.get("prompt")?.trim().slice(0, MAX_PROMPT) || "";
  const stored = request.cookies.get(COOKIE)?.value ?? "";
  const prompt = fresh || stored;

  // NB: the landing's ?lang=de|en handoff is consumed by proxy.ts (it sets the
  // locale cookie and strips the param) before this handler runs, so there's no
  // language handling to do here.

  // Not authenticated: hold the prompt and route to signup.
  if (!session?.user) {
    const res = NextResponse.redirect(new URL("/signup?next=/start", origin));
    if (fresh) res.cookies.set(COOKIE, fresh, COOKIE_OPTS);
    return res;
  }

  // Authenticated with a prompt: spin up a fresh app and auto-run it. We leave
  // the app on its default "Untitled app" name (no prompt-derived name) so the
  // auto-naming from /index.html's <title> applies on the first build — the
  // prompt sentence as a name shadowed the title and produced long, unwieldy
  // publish slugs (slugify(name)); the concise concept <title> is what we want
  // to drive both the project name AND the publish URL.
  if (prompt) {
    const project = await createProject(session.user.id);
    const res = NextResponse.redirect(
      new URL(`/app/${project.id}?run=1`, origin),
    );
    // Re-pin the cookie so the workspace can read the prompt and fire it once.
    res.cookies.set(COOKIE, prompt, COOKIE_OPTS);
    return res;
  }

  // Authenticated, nothing pending: normal entry.
  return NextResponse.redirect(new URL("/app", origin));
}
