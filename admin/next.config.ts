import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle (.next/standalone) for a small Docker image,
  // mirroring the builder/landing apps — see Dockerfile.
  output: "standalone",
};

export default nextConfig;
