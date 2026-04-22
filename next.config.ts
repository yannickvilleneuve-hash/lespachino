import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node-jt400", "java"],
  allowedDevOrigins: [
    "hino1-thinkcentre-m93p.tail0e1ea8.ts.net",
    "100.107.207.88",
  ],
};

export default nextConfig;
