import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Allow every crawler — including AI answer engines (GPTBot, ClaudeBot,
// PerplexityBot, Google-Extended …), which `*` covers — and point them at the
// sitemap. Being indexable by those engines is the baseline for GEO.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
