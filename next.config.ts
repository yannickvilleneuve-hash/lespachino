import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node-jt400", "java"],
};

export default nextConfig;
