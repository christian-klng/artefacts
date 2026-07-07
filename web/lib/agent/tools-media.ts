import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { timedTool as tool } from "./timed-tool";
import { writeBinaryFile } from "@/lib/projects";
import { searchIcons, getIcons } from "./icons";
import {
  getFont,
  searchFonts,
  loadFontFile,
  fontFaceCss,
  vfsFontFilename,
  type FontCut,
} from "./fonts";
import {
  pexelsApiKey,
  searchPexelsPhotos,
  getPexelsPhoto,
  sizedPhotoUrl,
  downloadImage,
  PHOTO_SIZES,
  type PexelsPhoto,
  type PhotoSize,
} from "./pexels";
import { assetPath } from "./vfs-paths";
import type { VfsEvent } from "./tools";

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function err(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

const PHOTOS_DISABLED_MSG =
  "Stock photos are not configured on this server (no PEXELS_API_KEY). " +
  "Build imagery with inline SVG/CSS instead, or ask the user to upload images.";

function photoLine(p: PexelsPhoto): string {
  const shape =
    p.width > p.height ? "landscape" : p.width < p.height ? "portrait" : "square";
  const alt = p.alt || "(no description)";
  const color = p.avgColor ? `, avg color ${p.avgColor}` : "";
  return `#${p.id} · ${p.width}×${p.height} ${shape}${color} · by ${p.photographer}\n   ${alt}`;
}

// Short filename slug from the photo's alt text, e.g. "brown-wooden-table".
function photoSlug(p: PexelsPhoto): string {
  const slug = p.alt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .split("-")
    .filter(Boolean)
    .slice(0, 4)
    .join("-");
  return slug || "photo";
}

function extensionFor(mimeType: string): string {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".jpg";
}

/**
 * In-process MCP server giving the agent design media: two fixed offline icon
 * libraries (Lucide UI icons + Simple Icons brand logos, returned as
 * inline-ready SVG markup), a bundled offline webfont catalog (OFL fonts
 * saved into the VFS as woff2 + ready @font-face CSS), and Pexels stock-photo
 * search/download. Fonts and photos are resolved SERVER-side and written into
 * the project's VFS as binary assets — the generated app itself still makes
 * no external network requests.
 */
export function buildMediaServer(
  projectId: string,
  onEvent: (event: VfsEvent) => void,
) {
  return createSdkMcpServer({
    name: "media",
    version: "1.0.0",
    instructions:
      "Icons (Lucide + brand logos) as inline SVG, real webfonts (bundled OFL " +
      "catalog, saved as local woff2 assets), and Pexels stock photos saved " +
      "into the project as local assets. Use these instead of emoji icons, " +
      "hand-drawn common glyphs, system-font-only typography, or external " +
      "font/image URLs.",
    tools: [
      tool(
        "search_icons",
        "Search the fixed icon libraries: Lucide (~2000 consistent stroke-style UI icons) and Simple Icons brand logos (prefixed 'brand:', e.g. brand:github). Returns matching icon names for get_icons.",
        {
          query: z
            .string()
            .describe("What the icon should express, in English (e.g. 'shopping cart', 'arrow', 'instagram')"),
          limit: z.number().int().min(1).max(50).optional(),
        },
        async ({ query, limit }) => {
          const matches = searchIcons(query, limit ?? 24);
          if (matches.length === 0) {
            return ok(
              `No icons match "${query}". Try a simpler or related English term.`,
            );
          }
          const lines = matches.map((m) => {
            const tags = m.terms.slice(0, 6).join(", ");
            return tags ? `${m.name} — ${tags}` : m.name;
          });
          return ok(
            `Icons matching "${query}" (fetch markup with get_icons):\n${lines.join("\n")}`,
          );
        },
      ),

      tool(
        "get_icons",
        "Get ready-to-inline <svg> markup for named icons (names from search_icons; 'brand:<slug>' for brand logos). Inline the SVG directly into the HTML — it uses currentColor, so it inherits the CSS `color` and can be sized via CSS or width/height.",
        {
          names: z
            .array(z.string())
            .min(1)
            .max(30)
            .describe("Icon names, e.g. ['arrow-right', 'menu', 'brand:github']"),
        },
        async ({ names }) => {
          const results = getIcons(names);
          const parts = results.map((r) =>
            r.found
              ? `${r.name}:\n${r.svg}`
              : `${r.name}: NOT FOUND${
                  r.suggestions.length > 0
                    ? ` — did you mean: ${r.suggestions.join(", ")}?`
                    : ""
                }`,
          );
          const anyFound = results.some((r) => r.found);
          const text = parts.join("\n\n");
          return anyFound ? ok(text) : err(text);
        },
      ),

      tool(
        "search_fonts",
        "Search the bundled offline font catalog (~29 OFL families across serif/sans/display/mono/slab/script — no Inter/Roboto). Query by name, category, or vibe (e.g. 'editorial serif', 'bauhaus geometric', 'terminal'). Empty query lists everything. Add your picks with add_font.",
        {
          query: z
            .string()
            .optional()
            .describe(
              "Name, category or vibe terms in English (e.g. 'luxury serif', 'mono terminal'); empty lists the full catalog",
            ),
          limit: z.number().int().min(1).max(30).optional(),
        },
        async ({ query, limit }) => {
          const matches = searchFonts(query ?? "", limit ?? 30);
          if (matches.length === 0) {
            return ok(
              `No fonts match "${query}". Try a category (serif, sans, display, mono, slab, script) or broader vibe terms — or an empty query to list everything.`,
            );
          }
          const lines = matches.map((m) => {
            const italic =
              m.italicWeights.length > 0
                ? `, italics ${m.italicWeights.join("/")}`
                : "";
            return `${m.id} — ${m.family} (${m.category}) · ${m.vibes.join(", ")} · weights ${m.weights.join("/")}${italic}`;
          });
          return ok(
            `Fonts${query?.trim() ? ` matching "${query}"` : ""} (save with add_font):\n${lines.join("\n")}`,
          );
        },
      ),

      tool(
        "add_font",
        "Save cuts of a catalog font into the project as local woff2 assets and get ready-to-inline @font-face CSS (relative urls, font-display: swap). Keep it lean: 1-2 families per app, 2-4 cuts per family (e.g. [400, 700]). Paste the returned CSS into your <style> and use the given font-family stack.",
        {
          id: z.string().describe("Catalog id from search_fonts, e.g. 'space-grotesk'"),
          weights: z
            .array(z.number().int())
            .min(1)
            .max(4)
            .optional()
            .describe("Normal-style weights to save (default [400, 700])"),
          italicWeights: z
            .array(z.number().int())
            .max(2)
            .optional()
            .describe("Italic weights to also save (only for families that have italics)"),
        },
        async ({ id, weights, italicWeights }) => {
          const entry = getFont(id);
          if (!entry) {
            return err(
              `Unknown font "${id}". Use search_fonts to find valid catalog ids.`,
            );
          }
          const cuts: FontCut[] = [
            ...(weights ?? [400, 700]).map((w) => ({ weight: w, italic: false })),
            ...(italicWeights ?? []).map((w) => ({ weight: w, italic: true })),
          ];
          if (cuts.length > 6) {
            return err(
              "Too many cuts (max 6 files per family). Fewer weights keep the app light.",
            );
          }
          try {
            let totalBytes = 0;
            for (const cut of cuts) {
              const file = await loadFontFile(entry.id, cut); // validates the cut
              const target = `/assets/fonts/${vfsFontFilename(entry.id, cut)}`;
              await writeBinaryFile(projectId, target, file.base64, "font/woff2");
              totalBytes += file.bytes;
              onEvent({
                type: "asset_changed",
                path: target,
                asset: {
                  mimeType: "font/woff2",
                  size: file.bytes,
                  hash: createHash("sha256").update(file.base64).digest("hex"),
                },
              });
            }
            return ok(
              `Saved ${entry.family} (${cuts.length} cut${cuts.length === 1 ? "" : "s"}, ${Math.round(totalBytes / 1024)} KB) under /assets/fonts/.\n` +
                `Inline this in your <style>:\n\n${fontFaceCss(entry, cuts)}`,
            );
          } catch (e) {
            return err(e instanceof Error ? e.message : String(e));
          }
        },
      ),

      tool(
        "search_stock_photos",
        "Search Pexels for free stock photos. Returns candidates WITH small preview images so you can see and judge them — pick the one that truly fits the app's theme, palette and mood, then save it with add_stock_photo. Query in English for best results.",
        {
          query: z.string().describe("English search terms, e.g. 'modern bakery interior'"),
          orientation: z.enum(["landscape", "portrait", "square"]).optional(),
          color: z
            .string()
            .optional()
            .describe("Filter by dominant color: red, orange, yellow, green, turquoise, blue, violet, pink, brown, black, gray, white, or a #hex value"),
          count: z.number().int().min(1).max(8).optional().describe("Results to return (default 5)"),
        },
        async ({ query, orientation, color, count }) => {
          const key = pexelsApiKey();
          if (!key) return err(PHOTOS_DISABLED_MSG);
          try {
            const photos = await searchPexelsPhotos(key, {
              query,
              orientation,
              color,
              perPage: count ?? 5,
            });
            if (photos.length === 0) {
              return ok(
                `No photos found for "${query}". Try broader or different English terms.`,
              );
            }
            // Interleave metadata and preview so the model can SEE each photo.
            const content: (
              | { type: "text"; text: string }
              | { type: "image"; data: string; mimeType: string }
            )[] = [
              {
                type: "text",
                text: `${photos.length} photos for "${query}" — previews below. Save your pick with add_stock_photo(id).`,
              },
            ];
            for (const p of photos) {
              content.push({ type: "text", text: photoLine(p) });
              try {
                const preview = await downloadImage(p.tinyUrl);
                content.push({
                  type: "image",
                  data: preview.base64,
                  mimeType: preview.mimeType,
                });
              } catch {
                content.push({ type: "text", text: "   (preview unavailable)" });
              }
            }
            return { content };
          } catch (e) {
            return err(e instanceof Error ? e.message : String(e));
          }
        },
      ),

      tool(
        "add_stock_photo",
        "Download a Pexels photo (id from search_stock_photos) into the project as a local asset and get its relative path to reference (e.g. <img src=\"assets/….jpg\">). Choose size by role: 'large' (1920px) for heroes/full-width, 'medium' (1280px, default) for sections, 'small' (640px) for cards/thumbnails.",
        {
          id: z.number().int().describe("The photo id from search_stock_photos"),
          size: z.enum(["small", "medium", "large"]).optional(),
          path: z
            .string()
            .optional()
            .describe("Optional target VFS path; defaults to /assets/<slug>-<id>.jpg"),
        },
        async ({ id, size, path }) => {
          const key = pexelsApiKey();
          if (!key) return err(PHOTOS_DISABLED_MSG);
          try {
            const photo = await getPexelsPhoto(key, id);
            if (!photo) return err(`Pexels photo not found: ${id}`);

            const chosen: PhotoSize = size ?? "medium";
            const image = await downloadImage(sizedPhotoUrl(photo, chosen));
            const target = await assetPath(
              projectId,
              `${photoSlug(photo)}-${photo.id}${extensionFor(image.mimeType)}`,
              path,
            );
            await writeBinaryFile(projectId, target, image.base64, image.mimeType);
            onEvent({
              type: "asset_changed",
              path: target,
              asset: {
                mimeType: image.mimeType,
                size: image.bytes,
                hash: createHash("sha256").update(image.base64).digest("hex"),
              },
            });

            const rel = target.replace(/^\//, "");
            const alt = photo.alt || "(write a meaningful alt text)";
            return ok(
              `Saved photo #${photo.id} as ${target} (~${PHOTO_SIZES[chosen]}px wide, ${Math.round(image.bytes / 1024)} KB).\n` +
                `Reference it by relative path: <img src="${rel}" alt="${alt}">\n` +
                `Photo by ${photo.photographer} on Pexels (free to use; attribution optional).`,
            );
          } catch (e) {
            return err(e instanceof Error ? e.message : String(e));
          }
        },
      ),
    ],
  });
}

// Tool names as the agent loop sees them (mcp__<server>__<tool>).
export const MEDIA_TOOL_NAMES = [
  "mcp__media__search_icons",
  "mcp__media__get_icons",
  "mcp__media__search_fonts",
  "mcp__media__add_font",
  "mcp__media__search_stock_photos",
  "mcp__media__add_stock_photo",
];
