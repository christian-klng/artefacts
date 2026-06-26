import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) for a small Docker
  // image — see Dockerfile.
  output: "standalone",
  // pdf-parse (and its pdfjs-dist dependency) and mammoth use Node internals and
  // are heavy — keep them out of the webpack bundle and require them at runtime.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "mammoth"],
  // The Claude Agent SDK ships its native CLI in sibling platform packages
  // (@anthropic-ai/claude-agent-sdk-<platform>) that static tracing misses.
  // Force the SDK and all its platform binaries into the standalone output so
  // the agent route works in Docker.
  outputFileTracingIncludes: {
    "/api/agent": [
      "./node_modules/@anthropic-ai/claude-agent-sdk/**/*",
      "./node_modules/@anthropic-ai/claude-agent-sdk-*/**/*",
    ],
    // Attachment text extraction needs the full pdf-parse/pdfjs/mammoth trees in
    // the standalone output (external packages aren't bundled, only traced).
    "/api/attachments": [
      "./node_modules/pdf-parse/**/*",
      "./node_modules/pdfjs-dist/**/*",
      "./node_modules/mammoth/**/*",
    ],
  },
};

export default nextConfig;
