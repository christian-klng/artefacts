import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminUser } from "@/lib/admin";
import { listGalleryProjects } from "@/lib/projects";
import { THUMBNAIL_PATH } from "@/lib/og-image";
import { AppGallery, type GalleryCard } from "@/components/app-gallery";

// "Meine Apps": a 3-column gallery of the user's projects. A normal user sees
// only their own; an admin (users.is_admin) sees ALL apps + each owner's email
// and can open any of them in the builder READ-ONLY (see getAccessibleProject).
// Static sibling of /app/[projectId] — project ids are UUIDs, so "apps" never
// collides; it inherits the /app layout header (logo + switcher + Home button).
export const dynamic = "force-dynamic";

export default async function AppsGalleryPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const admin = await isAdminUser(session.user.id);
  const projects = await listGalleryProjects(session.user.id, { admin });

  const cards: GalleryCard[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.publishSlug,
    updatedAt: p.updatedAt.getTime(),
    createdAt: p.createdAt.getTime(),
    // The asset route is owner/admin-gated; `thumbV` (the thumbnail's updatedAt)
    // busts the immutable cache when a build regenerates the screenshot.
    thumbnailUrl:
      p.thumbV != null
        ? `/api/projects/asset?projectId=${encodeURIComponent(p.id)}` +
          `&path=${encodeURIComponent(THUMBNAIL_PATH)}&v=${p.thumbV}`
        : null,
    ownerEmail: p.ownerEmail,
  }));

  return <AppGallery projects={cards} isAdmin={admin} />;
}
