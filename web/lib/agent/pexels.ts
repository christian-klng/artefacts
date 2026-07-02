// Thin Pexels API client for the builder agent's stock-photo tools.
// Pure module (no "server-only") so it stays unit-testable; only server code
// imports it. The API key is a secret and therefore env-only (like
// CORTECS_API_KEY / SMTP_PASS — deliberately not in the admin `app_setting`).

const API_BASE = "https://api.pexels.com/v1";
const FETCH_TIMEOUT_MS = 20_000;
// Keep saved photos web-sized: the VFS stores base64 in Postgres and every
// version snapshot copies it, so a hard cap protects the DB and exports.
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/** Free key from https://www.pexels.com/api/ — photo tools are off without it. */
export function pexelsApiKey(): string | null {
  const key = process.env.PEXELS_API_KEY;
  return key && key.trim() !== "" ? key.trim() : null;
}

export type PexelsPhoto = {
  id: number;
  width: number;
  height: number;
  alt: string;
  avgColor: string | null;
  photographer: string;
  photographerUrl: string;
  /** Base image URL on images.pexels.com (no query params). */
  originalUrl: string;
  /** Small preview (~280px) for showing the model what the photo looks like. */
  tinyUrl: string;
};

type RawPhoto = {
  id: number;
  width: number;
  height: number;
  alt?: string | null;
  avg_color?: string | null;
  photographer?: string;
  photographer_url?: string;
  src: { original: string; tiny: string };
};

function toPhoto(raw: RawPhoto): PexelsPhoto {
  return {
    id: raw.id,
    width: raw.width,
    height: raw.height,
    alt: raw.alt?.trim() || "",
    avgColor: raw.avg_color ?? null,
    photographer: raw.photographer ?? "",
    photographerUrl: raw.photographer_url ?? "",
    originalUrl: raw.src.original.split("?")[0],
    tinyUrl: raw.src.tiny,
  };
}

async function pexelsFetch(url: string, key: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { Authorization: key },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === 401) throw new Error("Pexels rejected the API key (401).");
  if (res.status === 429) {
    throw new Error("Pexels rate limit reached (429) — try again later.");
  }
  if (!res.ok) throw new Error(`Pexels request failed (${res.status}).`);
  return res;
}

export async function searchPexelsPhotos(
  key: string,
  {
    query,
    orientation,
    color,
    perPage,
  }: {
    query: string;
    orientation?: "landscape" | "portrait" | "square";
    color?: string;
    perPage?: number;
  },
): Promise<PexelsPhoto[]> {
  const params = new URLSearchParams({
    query,
    per_page: String(perPage ?? 5),
  });
  if (orientation) params.set("orientation", orientation);
  if (color) params.set("color", color);
  const res = await pexelsFetch(`${API_BASE}/search?${params}`, key);
  const body = (await res.json()) as { photos?: RawPhoto[] };
  return (body.photos ?? []).map(toPhoto);
}

export async function getPexelsPhoto(
  key: string,
  id: number,
): Promise<PexelsPhoto | null> {
  const res = await fetch(`${API_BASE}/photos/${id}`, {
    headers: { Authorization: key },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (res.status === 401) throw new Error("Pexels rejected the API key (401).");
  if (res.status === 429) {
    throw new Error("Pexels rate limit reached (429) — try again later.");
  }
  if (!res.ok) throw new Error(`Pexels request failed (${res.status}).`);
  return toPhoto((await res.json()) as RawPhoto);
}

export const PHOTO_SIZES = {
  small: 640,
  medium: 1280,
  large: 1920,
} as const;
export type PhotoSize = keyof typeof PHOTO_SIZES;

/** Sized, compressed variant via Pexels' image CDN parameters. */
export function sizedPhotoUrl(photo: PexelsPhoto, size: PhotoSize): string {
  return `${photo.originalUrl}?auto=compress&cs=tinysrgb&w=${PHOTO_SIZES[size]}`;
}

export async function downloadImage(
  url: string,
): Promise<{ base64: string; mimeType: string; bytes: number }> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Image download failed (${res.status}).`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_PHOTO_BYTES) {
    throw new Error(
      `Image is too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB > 8 MB) — pick a smaller size.`,
    );
  }
  return {
    base64: buffer.toString("base64"),
    mimeType: res.headers.get("content-type")?.split(";")[0] || "image/jpeg",
    bytes: buffer.length,
  };
}
