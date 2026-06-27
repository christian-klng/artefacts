import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle (.next/standalone) for a small Docker image,
  // mirroring the builder app — see Dockerfile.
  output: "standalone",
};

export default nextConfig;
