# artefacts — project guide

A self-hosted, multi-tenant **"Claude Code in the browser"**: a chat-driven agent builds a web app across a persistent virtual filesystem, with a live in-browser preview. Deploys to **Coolify**.

## Layout
- Root: `docker-compose.yml` (db + one-shot `migrate` + `web`), `.env.example`.
- `web/`: the Next.js 16 app (App Router, TypeScript, Tailwind v4, Drizzle, Auth.js v5). All app work happens here.

## Commands (run inside `web/`)
- `npm run dev` — local dev. `npm run build` — production build (also typechecks). `npm run lint`.
- `npm run db:push` — apply the Drizzle schema to the DB (used by the `migrate` compose service). `db:generate` for versioned SQL.
- After meaningful changes, run `npm run build` **and** `npm run lint` — both must be clean.

## Architecture & invariants (do not break these)
- **Client-side execution only.** The agent never runs shell commands or touches the host disk. Its tools operate on a **Postgres-backed virtual filesystem** scoped by `userId`/`projectId` (`lib/projects.ts`). This data-layer scoping is the multi-tenant isolation boundary — keep every file/project query scoped.
- **Agent = Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`): `query()` in `lib/agent/run.ts`, custom VFS tools via `createSdkMcpServer`/`tool()` in `lib/agent/tools.ts`. The agent is restricted to those tools (`allowedTools`), runs `permissionMode: 'bypassPermissions'` and `settingSources: []` (hermetic). Default model `claude-opus-4-8`, override via `ANTHROPIC_MODEL`.
- **Output contract:** the agent produces a **self-contained `/index.html`** (inline CSS/JS, no external network requests). The system prompt (`lib/agent/system-prompt.ts`) enforces this — it makes preview and download trivial.
- **Preview = sandboxed `<iframe srcDoc>`** of `/index.html` (`components/sandpack-workspace.tsx`), NOT Sandpack's preview (its runtime is CodeSandbox-hosted and fails self-hosted). Sandpack is used only for the offline file tree + read-only code viewer. The iframe runs **without `allow-same-origin`**.
- **Agent route** (`app/api/agent/route.ts`): authenticated SSE. Streams `assistant_text`, `tool_use`, and `file_changed`/`file_deleted`/`files` events; `runtime = 'nodejs'`. The client (`components/workspace.tsx`) parses the stream and updates chat + preview live.

## Next.js 16 gotchas (see `web/AGENTS.md` — read `node_modules/next/dist/docs/` before writing Next code)
- Middleware is renamed to **`proxy.ts`** (not `middleware.ts`).
- Route handler `params` are async; route handlers use Web `Request`/`Response`.
- Auth.js v5 split config: edge-safe `auth.config.ts` (used by `proxy.ts`), full `auth.ts` (DB + bcrypt). **JWT sessions** (required by the Credentials provider).

## Deployment notes
- `web/Dockerfile` is **Debian/glibc (`node:24-slim`)**, not Alpine: the Agent SDK ships a native glibc `linux-x64` CLI binary.
- `next.config.ts` uses `outputFileTracingIncludes` to force `@anthropic-ai/claude-agent-sdk` **and its sibling native packages** (`@anthropic-ai/claude-agent-sdk-*`) into the standalone output — tracing misses them otherwise.
- Coolify: set `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `POSTGRES_PASSWORD`; assign a domain and set `AUTH_URL` to the public `https://…` URL. Serve over **HTTPS** (secure context needed for `crypto.randomUUID` etc.).

## Phase status
0 (auth/DB/Docker), 1 (agent + SSE), 2 (workspace UI), 3 (download standalone HTML + artifact version history) done. Next: Phase 4 = multiple projects per user. Versions auto-snapshot after each agent turn that changes files (`createVersion`); restore via `POST /api/projects/restore`.

## Conventions
- Match existing code style; keep multi-tenant scoping on every query. Commit/push only when the user asks.
