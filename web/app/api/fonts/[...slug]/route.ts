import { getFont, hasCut, loadFontFile } from "@/lib/agent/fonts";

// Serves catalog woff2 files to the builder UI so the concept interview's
// style tiles can render REAL font specimens (client-side @font-face against
// this route). Public on purpose: these are OFL fonts bundled in node_modules,
// addressed strictly by catalog id + declared cut — no path reaches the fs.
//
// URL shape: /api/fonts/<id>/<weight>.woff2 or /api/fonts/<id>/<weight>-italic.woff2

export const runtime = "nodejs";

const FILE_RE = /^(\d{3})(-italic)?\.woff2$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  if (slug.length !== 2) return new Response("Not found", { status: 404 });

  const entry = getFont(slug[0]);
  const match = slug[1].match(FILE_RE);
  if (!entry || !match) return new Response("Not found", { status: 404 });

  const cut = { weight: Number(match[1]), italic: match[2] === "-italic" };
  if (!hasCut(entry, cut)) return new Response("Not found", { status: 404 });

  const file = await loadFontFile(entry.id, cut);
  return new Response(new Uint8Array(Buffer.from(file.base64, "base64")), {
    headers: {
      "Content-Type": "font/woff2",
      // Catalog files are immutable per deploy; let browsers cache hard.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
