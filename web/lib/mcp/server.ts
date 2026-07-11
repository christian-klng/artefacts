import "server-only";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  listFiles,
  readFile,
  readFileRaw,
  writeFile,
  editFile,
  deleteFile,
  getClientFiles,
} from "@/lib/projects";
import { buildSystemPrompt } from "@/lib/agent/system-prompt";
import {
  lintDensity,
  formatDensityNote,
  type DensityRule,
} from "@/lib/density-lint";
import { snapshotBeforeMutation, afterMutation } from "./hooks";

// The pinned project the whole connection operates on. Resolved by the route
// (from ?app=<projectId>) and passed in, so the low-level tools never re-query.
export type McpProject = {
  id: string;
  userId: string;
  name: string;
  published: boolean;
  databaseEnabled: boolean;
  publishSlug: string | null;
};

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
function err(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

// Prepended to get_build_guidelines: the in-app builder prompt assumes tools
// this external bridge does NOT expose (icon sprite, font catalog, stock photos,
// attachments, apply_schema). This note reconciles the two so the operator's AI
// stays on-brand while working only within what the project already has.
const MCP_INTERFACE_NOTE = `# artefacts — external editing interface (via MCP)

You are editing a LIVE artefacts web app through the MCP bridge, on behalf of a support operator — NOT inside the normal in-app builder. The guidelines that follow are the SAME ones the in-app builder agent works to; honor them so your edits stay consistent with the app's design.

Tools available over THIS interface: list_files, read_file, write_file, edit_file, delete_file, get_project (project meta + the internal /CONCEPT.md, /DESIGN.md and /SEO_GEO.md), get_build_guidelines. There is no shell, no package install, and no other filesystem.

NOT available here (unlike the in-app agent) — work within what the project already has:
- Icons: the icon-sprite tools (search_icons/add_icons) are absent. Reference symbols already in /assets/icons.svg via <use href="#id"> (read that file to see what exists); hand-write inline SVG only for what is genuinely missing.
- Fonts: the webfont catalog (search_fonts/add_font) is absent. Reuse the @font-face families already declared in /styles.css; never add new font files or hotlink web fonts.
- Imagery: stock photos (search_stock_photos/add_stock_photo) and attachments are absent. Reuse existing assets or inline SVG/CSS; never hotlink external images or make any network request.
- Database schema changes (apply_schema) and new dependencies are not possible here — leave those to the in-app builder.

BEFORE editing: call get_project and READ /DESIGN.md (the binding design DNA) and /CONCEPT.md (durable decisions), then read the files you will touch. Edit and EXTEND the existing code; do not rebuild from scratch. Your changes are applied immediately and are not shown in the user's chat.

--- The in-app builder guidelines follow ---

`;

/**
 * Advisory density readout appended to /index.html writes, mirroring the VFS
 * tool (lib/agent/tools.ts): only NEWLY introduced rules (vs the pre-write
 * content) are flagged, and rules flagged earlier in this connection resurface
 * as "still unresolved" while present. A lint error never breaks a write.
 */
function densityNote(
  reported: Set<DensityRule>,
  content: string,
  previous: string | null,
): string {
  try {
    const findings = lintDensity(content);
    const baseline =
      previous != null
        ? new Set(lintDensity(previous).map((f) => f.rule))
        : new Set<DensityRule>();
    const fresh = findings.filter(
      (f) => !baseline.has(f.rule) && !reported.has(f.rule),
    );
    const open = findings.filter((f) => reported.has(f.rule));
    for (const f of fresh) reported.add(f.rule);
    const parts: string[] = [];
    if (fresh.length > 0) parts.push(formatDensityNote(fresh));
    if (open.length > 0) {
      parts.push(
        "Still unresolved from the density check earlier in this session:\n" +
          open.map((f) => `- ${f.measured}`).join("\n") +
          "\n(If a listed item is deliberate — app UI, dense design DNA, or user-requested — ignore it and move on.)",
      );
    }
    return parts.length > 0 ? `\n\n${parts.join("\n\n")}` : "";
  } catch {
    return "";
  }
}

/** Human-readable byte size for the get_project asset listing. */
function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Builds the MCP server exposed at POST /api/mcp for one pinned project. It
 * mirrors the internal VFS tools (same lib/projects.ts functions) plus two
 * read-only helpers that hand the operator's AI the same context the in-app
 * agent gets injected every turn (build guidelines + the internal DNA files).
 * Mutations run the shared hooks (pre-edit snapshot + post-edit maintenance +
 * audit) so an MCP edit stays byte-consistent with a builder turn.
 */
export function buildMcpServer(
  project: McpProject,
  actor: string | null,
): McpServer {
  // Density rules already flagged during THIS connection (see densityNote).
  const reportedDensity = new Set<DensityRule>();

  const server = new McpServer(
    { name: "artefacts-app", version: "1.0.0" },
    {
      instructions:
        "You are editing a live artefacts web app on behalf of a support operator. " +
        "BEFORE making changes call get_build_guidelines once, then get_project to read " +
        "the app's binding design DNA (/DESIGN.md), its durable decisions (/CONCEPT.md) " +
        "and its file list. Then read the files you will touch and EDIT/extend them — " +
        "never rebuild from scratch. Only these MCP tools exist here; there is no shell, " +
        "no package install, and no icon/font/photo tooling. Your edits apply immediately " +
        "and are not written to the user's chat.",
    },
  );

  server.registerTool(
    "get_build_guidelines",
    {
      title: "Get build guidelines",
      description:
        "Return the artefacts builder guidelines (design DNA rules, output contract, content economy, SEO baseline) — the same system guidance the in-app agent follows, adapted to this MCP interface. Call once before editing.",
    },
    async () => ok(MCP_INTERFACE_NOTE + buildSystemPrompt({ stockPhotos: false })),
  );

  server.registerTool(
    "get_project",
    {
      title: "Get project",
      description:
        "Return the app's metadata, its file/asset listing, and the full internal docs (/DESIGN.md, /CONCEPT.md, /SEO_GEO.md) that define the design DNA and durable decisions. Read this before editing.",
    },
    async () => {
      const client = await getClientFiles(project.id);
      const files = Object.keys(client.files).sort();
      const assets = Object.entries(client.assets).sort(([a], [b]) =>
        a.localeCompare(b),
      );
      const lines: string[] = [
        `Project: ${project.name} (${project.id})`,
        `Published: ${project.published ? "yes" : "no"}` +
          (project.publishSlug ? ` (slug: ${project.publishSlug})` : "") +
          `  |  Database: ${project.databaseEnabled ? "enabled" : "disabled"}`,
        "",
        `Files (${files.length}):`,
        ...files.map((p) => `  ${p}`),
        "",
        `Assets (${assets.length}) — reference by relative path, they can't be read as text:`,
        ...assets.map(
          ([p, a]) => `  ${p} (${a.mimeType ?? "?"}, ${humanSize(a.size)})`,
        ),
      ];
      for (const [label, path] of [
        ["/DESIGN.md", "/DESIGN.md"],
        ["/CONCEPT.md", "/CONCEPT.md"],
        ["/SEO_GEO.md", "/SEO_GEO.md"],
      ] as const) {
        const content = client.internal[path];
        lines.push("", `===== ${label} =====`, content?.trim() || "(none yet)");
      }
      return ok(lines.join("\n"));
    },
  );

  server.registerTool(
    "list_files",
    { title: "List files", description: "List every file path in the project." },
    async () => {
      const all = await listFiles(project.id);
      if (all.length === 0) return ok("(no files yet)");
      return ok(all.map((f) => f.path).join("\n"));
    },
  );

  server.registerTool(
    "read_file",
    {
      title: "Read file",
      description:
        "Read the full contents of a text file by its absolute path (e.g. /index.html).",
      inputSchema: { path: z.string() },
    },
    async ({ path }) => {
      const raw = await readFileRaw(project.id, path);
      if (raw === null) return err(`File not found: ${path}`);
      if (raw.encoding === "base64") {
        return err(
          `${path} is a binary asset (${raw.mimeType ?? "unknown type"}) — it can't be read as text. Reference it by path instead.`,
        );
      }
      return ok(raw.content);
    },
  );

  server.registerTool(
    "write_file",
    {
      title: "Write file",
      description: "Create or overwrite a text file with the given contents.",
      inputSchema: { path: z.string(), content: z.string() },
    },
    async ({ path, content }) => {
      const previous =
        path === "/index.html" ? await readFile(project.id, path) : null;
      await snapshotBeforeMutation(project.id);
      await writeFile(project.id, path, content);
      await afterMutation({
        projectId: project.id,
        ownerId: project.userId,
        action: "write",
        path,
        actor,
      });
      const note =
        path === "/index.html"
          ? densityNote(reportedDensity, content, previous)
          : "";
      return ok(`Wrote ${path}${note}`);
    },
  );

  server.registerTool(
    "edit_file",
    {
      title: "Edit file",
      description:
        "Replace a single, unique occurrence of old_string with new_string in a file.",
      inputSchema: {
        path: z.string(),
        old_string: z.string(),
        new_string: z.string(),
      },
    },
    async ({ path, old_string, new_string }) => {
      const raw = await readFileRaw(project.id, path);
      if (raw === null) return err(`File not found: ${path}`);
      if (raw.encoding === "base64") {
        return err(`${path} is a binary asset and can't be edited as text.`);
      }
      await snapshotBeforeMutation(project.id);
      const result = await editFile(project.id, path, old_string, new_string);
      if (!result.ok) return err(result.error);
      const content = (await readFile(project.id, path)) ?? "";
      await afterMutation({
        projectId: project.id,
        ownerId: project.userId,
        action: "edit",
        path,
        actor,
      });
      const note =
        path === "/index.html"
          ? densityNote(reportedDensity, content, raw.content)
          : "";
      return ok(`Edited ${path}${note}`);
    },
  );

  server.registerTool(
    "delete_file",
    {
      title: "Delete file",
      description: "Delete a file from the project.",
      inputSchema: { path: z.string() },
    },
    async ({ path }) => {
      await snapshotBeforeMutation(project.id);
      const deleted = await deleteFile(project.id, path);
      if (!deleted) return err(`File not found: ${path}`);
      await afterMutation({
        projectId: project.id,
        ownerId: project.userId,
        action: "delete",
        path,
        actor,
      });
      return ok(`Deleted ${path}`);
    },
  );

  return server;
}
