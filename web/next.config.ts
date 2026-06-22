import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) for a small Docker
  // image — see Dockerfile.
  output: "standalone",
  // The Claude Agent SDK ships a bundled CLI that static tracing can miss;
  // force it into the standalone output so the agent route works in Docker.
  outputFileTracingIncludes: {
    "/api/agent": ["./node_modules/@anthropic-ai/claude-agent-sdk/**/*"],
  },
};

export default nextConfig;
