import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { COOKIE_NAME, verifySession } from "@/lib/auth";
import { db } from "@/lib/db";
import { files } from "@/lib/schema";

const THUMBNAIL_PATH = "/assets/og-thumbnail.png";

// This is deliberately served by the admin app rather than linking to the
// builder's owner-scoped asset endpoint: admins may inspect every user's app.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await verifySession((await cookies()).get(COOKIE_NAME)?.value);
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { projectId } = await params;
  const thumbnail = await db.query.files.findFirst({
    where: and(eq(files.projectId, projectId), eq(files.path, THUMBNAIL_PATH)),
    columns: { content: true, encoding: true, mimeType: true },
  });
  if (!thumbnail) return new Response("Not found", { status: 404 });

  const body =
    thumbnail.encoding === "base64"
      ? new Uint8Array(Buffer.from(thumbnail.content, "base64"))
      : thumbnail.content;
  return new Response(body, {
    headers: {
      "content-type": thumbnail.mimeType ?? "image/png",
      "cache-control": "private, no-store",
    },
  });
}
