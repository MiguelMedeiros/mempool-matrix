import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["100.81.12.32"],
  turbopack: {
    ignoreIssue: [{
      path: "**/next.config.ts",
      title: "Encountered unexpected file in NFT list",
    }],
  },
};

export default nextConfig;
