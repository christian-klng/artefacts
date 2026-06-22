import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle (.next/standalone) for a small Docker
  // image — see Dockerfile.
  output: "standalone",
  // The Claude Agent SDK ships its native CLI in sibling platform packages
  // (@anthropic-ai/claude-agent-sdk-<platform>) that static tracing misses.
  // Force the SDK and all its platform binaries into the standalone output so
  // the agent route works in Docker.
  outputFileTracingIncludes: {
    "/api/agent": [
      "./node_modules/@anthropic-ai/claude-agent-sdk/**/*",
      "./node_modules/@anthropic-ai/claude-agent-sdk-*/**/*",
    ],
  },
};

export default nextConfig;
