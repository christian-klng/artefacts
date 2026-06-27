import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SITE_DESCRIPTION, SITE_TAGLINE } from "@/lib/site";

// Social-share card (1200×630). Generated at build time as a PNG — no binary
// asset to maintain. Also reused for the Twitter/X card (see twitter-image.tsx).
export const alt = "Kubikraum — Web-Apps aus einem Prompt";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const logo = await readFile(
    join(process.cwd(), "public/brand/logo-on-light.svg"),
  );
  const logoSrc = `data:image/svg+xml;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#ffffff",
          padding: 80,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={72} height={72} alt="" />
          <div style={{ fontSize: 38, fontWeight: 600, color: "#171717" }}>
            Kubikraum
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 68,
              fontWeight: 700,
              color: "#171717",
              lineHeight: 1.1,
              letterSpacing: -1,
            }}
          >
            {SITE_TAGLINE}
          </div>
          <div style={{ fontSize: 30, color: "#737373", lineHeight: 1.3 }}>
            {SITE_DESCRIPTION}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 26,
            color: "#737373",
          }}
        >
          <div
            style={{
              width: 34,
              height: 6,
              background: "#FFD166",
              borderRadius: 3,
            }}
          />
          kubikraum.digital
        </div>
      </div>
    ),
    { ...size },
  );
}
