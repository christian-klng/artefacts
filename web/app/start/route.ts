import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
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

/** A short, human-friendly project name derived from the prompt. */
function deriveName(prompt: string): string {
  const firstLine = prompt.split("\n")[0]?.trim() ?? "";
  const base = (firstLine || prompt.trim()).replace(/\s+/g, " ");
  if (!base) return "Neue App";
  return base.length > 40 ? `${base.slice(0, 40).trimEnd()}…` : base;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  const url = request.nextUrl;

  const fresh = url.searchParams.get("prompt")?.trim().slice(0, MAX_PROMPT) || "";
  const stored = request.cookies.get(COOKIE)?.value ?? "";
  const prompt = fresh || stored;

  // Not authenticated: hold the prompt and route to signup.
  if (!session?.user) {
    const res = NextResponse.redirect(new URL("/signup?next=/start", url));
    if (fresh) res.cookies.set(COOKIE, fresh, COOKIE_OPTS);
    return res;
  }

  // Authenticated with a prompt: spin up a fresh app and auto-run it.
  if (prompt) {
    const project = await createProject(session.user.id, deriveName(prompt));
    const res = NextResponse.redirect(new URL(`/app/${project.id}?run=1`, url));
    // Re-pin the cookie so the workspace can read the prompt and fire it once.
    res.cookies.set(COOKIE, prompt, COOKIE_OPTS);
    return res;
  }

  // Authenticated, nothing pending: normal entry.
  return NextResponse.redirect(new URL("/app", url));
}
