# artefacts — project guide

A self-hosted, multi-tenant **"Claude Code in the browser"**: a chat-driven agent builds a web app across a persistent virtual filesystem, with a live in-browser preview. Deploys to **Coolify**.

## Layout
- Root: `docker-compose.yml` (db + one-shot `migrate` + `web`), `.env.example`.
- `web/`: the Next.js 16 app (App Router, TypeScript, Tailwind v4, Drizzle, Auth.js v5). All app work happens here.

## Commands (run inside `web/`)
- `npm run dev` — local dev. `npm run build` — production build (also typechecks). `npm run lint`.
- `npm run db:push` — apply the Drizzle schema to the DB (used by the `migrate` compose service). `db:generate` for versioned SQL.
- `npm run spike` — boots a throwaway real Postgres (`embedded-postgres`, devDep) and runs `scripts/security-spike.mjs`, the per-project DB **isolation** regression test. Keep it green.
- After meaningful changes, run `npm run build` **and** `npm run lint` — both must be clean.

## Architecture & invariants (do not break these)
- **Client-side execution only.** The agent never runs shell commands or touches the host disk. Its tools operate on a **Postgres-backed virtual filesystem** scoped by `userId`/`projectId` (`lib/projects.ts`). This data-layer scoping is the multi-tenant isolation boundary — keep every file/project query scoped.
- **Agent = Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`): `query()` in `lib/agent/run.ts`, custom VFS tools via `createSdkMcpServer`/`tool()` in `lib/agent/tools.ts`. The agent is restricted to those tools (`allowedTools`), runs `permissionMode: 'bypassPermissions'` and `settingSources: []` (hermetic). Default model `claude-opus-4-8`, override via `ANTHROPIC_MODEL`.
- **Output contract:** the agent produces a **self-contained `/index.html`** (inline CSS/JS, no external network requests). The system prompt (`lib/agent/system-prompt.ts`) enforces this — it makes preview and download trivial.
- **Preview** of `/index.html` (`components/sandpack-workspace.tsx`), NOT Sandpack's preview (its runtime is CodeSandbox-hosted and fails self-hosted). Sandpack is used only for the offline file tree + read-only code viewer. Two modes:
  - **Subdomain serving** (when `APPS_DOMAIN` is set): an `<iframe src>` to `preview-<projectId>.apps.<APPS_DOMAIN>`, served by `app/serve/route.ts` and gated by a signed token (`lib/preview-token.ts`). On its own origin the iframe **uses `allow-same-origin`** (safe — a different origin than the builder; required for real cookies/storage/auth later). See "Way 3" below.
  - **Fallback `<iframe srcDoc>`** (when `APPS_DOMAIN` is unset): inline, sandboxed **without `allow-same-origin`**.
- **Agent route** (`app/api/agent/route.ts`): authenticated SSE. Streams `assistant_text`, `tool_use`, and `file_changed`/`file_deleted`/`files` events; `runtime = 'nodejs'`. The client (`components/workspace.tsx`) parses the stream and updates chat + preview live.

## Way 3 — real per-project backend (in progress)
Direction (decided): give generated apps a **real database + real end-user auth** so they stop faking logins/data, and can be published. Chosen approach: our **own data+auth API on the existing Postgres**, **one schema per project**, **per-project subdomains**. This will relax the "no backend" stance above for *generated apps* — the builder/agent invariants stay.
- **Phase 1 — subdomain serving (built, deployed):** `proxy.ts` routes `*.apps.<APPS_DOMAIN>` requests to `app/serve/route.ts` (serves the project's VFS `/index.html`, injects `window.__ARTEFACTS__`), gated by `lib/preview-token.ts`; host parsing in `lib/app-host.ts`. The builder stays on the main domain. Needs env `APPS_DOMAIN` + wildcard DNS/TLS (see Deployment).
- **Isolation model (proven, not yet wired):** `lib/appdb/sql.ts` (pure, injection-safe SQL/identifier + constrained-query builders) and `lib/appdb/exec.ts` (runs every tenant query under `SET LOCAL ROLE proj_<id>_role` + pinned `search_path` + `app.end_user_id` GUC). Cross-tenant isolation = a per-project low-privilege Postgres role (USAGE/CREATE only on its own schema); end-user isolation = Postgres **RLS**. Enforced in Postgres, never by trusting the generated client. Verified by `npm run spike`.
- **Next:** Phase 2 = data API (`app/api/db/[projectId]`) + injected `window.artefacts.db` SDK + an agent `apply_schema` tool (runs `/database.sql` as DDL **under the project role**). Phase 3 = end-user auth (`appUser` table + cookie/JWT on the app subdomain) + auto-RLS. Phase 4 = publish + SQL export.

## Next.js 16 gotchas (see `web/AGENTS.md` — read `node_modules/next/dist/docs/` before writing Next code)
- Middleware is renamed to **`proxy.ts`** (not `middleware.ts`).
- Route handler `params` are async; route handlers use Web `Request`/`Response`.
- Auth.js v5 split config: edge-safe `auth.config.ts` (used by `proxy.ts`), full `auth.ts` (DB + bcrypt). **JWT sessions** (required by the Credentials provider).

## Deployment notes
- `web/Dockerfile` is **Debian/glibc (`node:24-slim`)**, not Alpine: the Agent SDK ships a native glibc `linux-x64` CLI binary.
- `next.config.ts` uses `outputFileTracingIncludes` to force `@anthropic-ai/claude-agent-sdk` **and its sibling native packages** (`@anthropic-ai/claude-agent-sdk-*`) into the standalone output — tracing misses them otherwise.
- Coolify: set `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `POSTGRES_PASSWORD`; assign a domain and set `AUTH_URL` to the builder's public `https://…` URL. Serve over **HTTPS** (secure context needed for `crypto.randomUUID` etc.).
- **`APPS_DOMAIN`** (Way 3): generated apps are served from `<label>.apps.<APPS_DOMAIN>`; the builder runs on a **separate** hostname (e.g. `app.<domain>`). Requires a **wildcard DNS** record (`*.apps`) and **wildcard TLS** (DNS-01 — the HTTP-01 challenge can't issue wildcards). If `APPS_DOMAIN` is unset the preview falls back to inline `srcDoc` (no real origin). Deployment-instance specifics (current domain, cert/Traefik wiring) live in agent memory, not here.

## Phase status
Original phases all done: 0 (auth/DB/Docker), 1 (agent + SSE), 2 (workspace UI), 3 (download standalone HTML + version history), 4 (multiple projects per user). Versions auto-snapshot after each agent turn that changes files (`createVersion`); restore via `POST /api/projects/restore`. Projects: `/app` redirects to the latest project; `/app/[projectId]` is the workspace; `ProjectSwitcher` (header) + `app/actions/projects.ts` handle create/rename/delete.

**Way 3** (real per-project backend): Phase 1 (subdomain serving) built + deployed; isolation core proven (`npm run spike`). Phases 2–4 (data API/SDK, end-user auth, publish) not yet built — see "Way 3" above.

## Conventions
- Match existing code style; keep multi-tenant scoping on every query. Commit/push only when the user asks.
