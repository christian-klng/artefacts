import { zipSync, strToU8 } from "fflate";
import { auth } from "@/auth";
import { getOwnedProject, listFiles } from "@/lib/projects";
import { isInternalVfsPath } from "@/lib/concept";
import { embedIconSprite, ICON_SPRITE_PATH } from "@/lib/vfs";
import { substituteSiteUrl, normalizeSiteOrigin } from "@/lib/site-url";
import { dumpTenantData } from "@/lib/appdb/provision";
import { serializeTenantDump } from "@/lib/appdb/dump";

// Builds a ZIP of the project's whole virtual filesystem (text + binary assets)
// so the user gets exactly the files in the Code tree to run/edit locally.
// Ownership-gated.
export const runtime = "nodejs";

const DB_README = `# Datenbank

Diese App nutzt eine Datenbank. Zwei Dateien gehören dazu:

- \`database.sql\` — das Schema (CREATE TABLE …).
- \`database-data.sql\` — die aktuellen Daten (INSERT …).

## Lokal einrichten (Postgres)

\`\`\`bash
createdb meine_app
psql meine_app -f database.sql
psql meine_app -f database-data.sql
\`\`\`

Die App spricht im Hosting-Betrieb über \`window.artefacts.db\` / \`window.artefacts.auth\`
mit der Datenbank. Diese Schnittstelle stellt die Artefacts-Plattform bereit; beim
Selbst-Hosting must du sie durch einen eigenen kleinen Daten-/Auth-Endpunkt ersetzen
(oder die App auf der Plattform veröffentlicht lassen, wo sie automatisch vorhanden ist).

Hinweis: \`owner_id\`-Spalten markieren pro-Nutzer-private Tabellen (Row-Level-Security).
`;

function zipName(name: string): string {
  const clean = name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${clean || "app"}.zip`;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;

  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId) return new Response("projectId is required", { status: 400 });

  let project;
  try {
    project = await getOwnedProject(projectId, userId);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  // Origin for SEO placeholders: the URL the user typed in the export modal wins,
  // else the project's stored siteUrl, else empty (absolute URLs degrade to
  // relative — never a leaked __SITE_URL__ token).
  const param = url.searchParams.get("siteUrl");
  const origin =
    (param != null ? normalizeSiteOrigin(param) : null) ?? project.siteUrl ?? "";

  const all = await listFiles(projectId);
  const spriteFile = all.find((f) => f.path === ICON_SPRITE_PATH);
  const spriteContent =
    spriteFile && spriteFile.encoding !== "base64" ? spriteFile.content : null;
  const entries: Record<string, Uint8Array> = {};
  for (const f of all) {
    // Internal agent files (CONCEPT.md) are memory, not part of the app.
    if (isInternalVfsPath(f.path)) continue;
    // Strip the leading "/" so the zip has clean relative paths.
    const name = f.path.replace(/^\//, "");
    if (f.encoding === "base64") {
      entries[name] = new Uint8Array(Buffer.from(f.content, "base64"));
      continue;
    }
    let text = substituteSiteUrl(f.content, origin);
    // Embed the sprite into the entry doc so `<use href="#id">` resolves when the
    // downloaded app is opened directly (file://), where an external sprite ref
    // can't load. Other files keep their refs — they serve fine from a webserver.
    if (f.path === "/index.html") text = embedIconSprite(text, spriteContent);
    entries[name] = strToU8(text);
  }

  // When the app has a managed database, ship its current data alongside the
  // schema (database.sql is already a VFS file, so it's in `entries`). The user
  // can recreate the whole DB on a plain Postgres: run database.sql, then
  // database-data.sql.
  if (project.databaseEnabled) {
    try {
      const dump = await dumpTenantData(projectId);
      entries["database-data.sql"] = strToU8(serializeTenantDump(dump));
      entries["DATABASE.md"] = strToU8(DB_README);
    } catch (e) {
      // A dump failure must never block the code export.
      console.error("[export] DB dump failed", e);
    }
  }

  const zipped = zipSync(entries, { level: 6 });
  return new Response(new Uint8Array(zipped), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${zipName(project.name)}"`,
      "cache-control": "no-store",
    },
  });
}
