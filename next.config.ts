import type { NextConfig } from "next";

const nonRuntimeProjectFiles = [
  "src/**/*",
  "docs/**/*",
  "assets/**/*",
  "scripts/**/*",
  "coverage/**/*",
  "data/**/*",
  ".data/**/*",
  ".git/**/*",
  ".github/**/*",
  ".hermes/**/*",
  ".vercel/**/*",
  "*.md",
  "LICENSE*",
  "Dockerfile",
  "Dockerfile.*",
  "docker-compose*.yml",
  "docker-compose*.yaml",
  ".dockerignore",
  ".gitignore",
  "package-lock.json",
  "eslint.config.*",
  "postcss.config.*",
  "vitest.config.*",
  "tsconfig*.json",
  "tsconfig*.tsbuildinfo",
  "next.config.*",
  ".env*",
  ".npmrc",
  ".yarnrc*",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
  "*.crt",
  "*.cer",
];

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: {
    "/*": nonRuntimeProjectFiles,
  },
  turbopack: {
    ignoreIssue: [{
      path: "**/next.config.ts",
      title: "Encountered unexpected file in NFT list",
    }],
  },
};

export default nextConfig;
