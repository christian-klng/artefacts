import "server-only";
import {
  cortecsApiKey,
  cortecsOpenAiBaseUrl,
  cortecsPriceTtlMs,
} from "./config";

// Cortecs does NOT return a EUR cost per request — only token counts. To bill we
// fetch the model price catalog (GET /v1/models?currency=EUR) and compute cost
// ourselves from tokens × per-token price. The catalog is memoized in-process
// with a TTL since prices change rarely and every agent turn needs it.

export type ModelPrice = {
  /** EUR cost per 1,000,000 input tokens. */
  inputPerMillion: number;
  /** EUR cost per 1,000,000 output tokens. */
  outputPerMillion: number;
  currency: string;
  /** Cortecs providers that can serve the model (providers[0] is recorded). */
  providers: string[];
};

type CatalogEntry = {
  id: string;
  pricing?: {
    input_token?: number | string;
    output_token?: number | string;
    currency?: string;
  };
  providers?: string[];
};

type Cache = { map: Map<string, ModelPrice>; fetchedAt: number };

const globalForPrices = globalThis as unknown as { cortecsPriceCache?: Cache };

async function loadCatalog(): Promise<Cache> {
  const cached = globalForPrices.cortecsPriceCache;
  if (cached && Date.now() - cached.fetchedAt < cortecsPriceTtlMs()) {
    return cached;
  }

  const url = `${cortecsOpenAiBaseUrl()}/models?currency=EUR`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${cortecsApiKey()}` },
    // Always hit the live catalog; we do our own in-process TTL caching.
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Cortecs /models failed: ${res.status} ${res.statusText} ${body}`.trim(),
    );
  }

  const json = (await res.json()) as { data?: CatalogEntry[] };
  const entries = Array.isArray(json?.data) ? json.data : [];
  const map = new Map<string, ModelPrice>();
  for (const e of entries) {
    if (!e?.id) continue;
    const input = toNumber(e.pricing?.input_token);
    const output = toNumber(e.pricing?.output_token);
    map.set(e.id, {
      inputPerMillion: input,
      outputPerMillion: output,
      currency: e.pricing?.currency ?? "EUR",
      providers: Array.isArray(e.providers) ? e.providers : [],
    });
  }

  const fresh: Cache = { map, fetchedAt: Date.now() };
  globalForPrices.cortecsPriceCache = fresh;
  return fresh;
}

/**
 * Resolves the price-catalog key for a model id as *reported* by the runtime
 * (e.g. an SDK `modelUsage` key), which may not be the exact catalog id. Tries
 * an exact match, then a provider-prefix / version-suffix tolerant match, then
 * returns null so the caller fails loud rather than billing a 0 price.
 */
function resolvePriceKey(
  map: Map<string, ModelPrice>,
  reported: string,
): string | null {
  if (map.has(reported)) return reported;

  // "anthropic/claude-opus-4-8" -> match on the last path segment.
  const bare = reported.includes("/")
    ? reported.slice(reported.lastIndexOf("/") + 1)
    : reported;
  if (map.has(bare)) return bare;

  // Tolerate provider-prefixed catalog ids ("anthropic/claude-opus-4-8") or a
  // catalog id that is a prefix of the reported one (date-suffixed variants).
  for (const key of map.keys()) {
    const keyBare = key.includes("/") ? key.slice(key.lastIndexOf("/") + 1) : key;
    if (keyBare === bare) return key;
    if (bare.startsWith(keyBare) || keyBare.startsWith(bare)) return key;
  }
  return null;
}

/**
 * Returns the EUR per-million prices for a model. Throws if the model can't be
 * resolved in the catalog — billing must never silently charge 0. `fallback`
 * (typically the configured build model id) is tried before giving up.
 */
export async function getModelPrice(
  model: string,
  fallback?: string,
): Promise<ModelPrice> {
  const { map } = await loadCatalog();
  const key =
    resolvePriceKey(map, model) ??
    (fallback ? resolvePriceKey(map, fallback) : null);
  if (!key) {
    throw new Error(
      `No Cortecs price for model "${model}"` +
        (fallback ? ` (fallback "${fallback}" also unresolved)` : "") +
        " — refusing to bill 0.",
    );
  }
  const price = map.get(key)!;
  if (!(price.inputPerMillion >= 0) || !(price.outputPerMillion >= 0)) {
    throw new Error(`Cortecs price for "${key}" is invalid — refusing to bill.`);
  }
  return price;
}

function toNumber(v: number | string | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}
