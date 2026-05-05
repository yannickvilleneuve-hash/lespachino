import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node-jt400", "java"],
  allowedDevOrigins: [
    "hino1-thinkcentre-m93p.tail0e1ea8.ts.net",
    "100.107.207.88",
    "ventes.hinochicoutimi.com",
    "feeds.hinochicoutimi.com",
  ],
  experimental: {
    serverActions: {
      // Server Actions arrivent via Cloudflare Worker → x-forwarded-host
      // n'égale pas Origin. Whitelist explicite des origines clientes.
      allowedOrigins: [
        "ventes.hinochicoutimi.com",
        "feeds.hinochicoutimi.com",
        "hino1-thinkcentre-m93p.tail0e1ea8.ts.net:8443",
        "hino1-thinkcentre-m93p.tail0e1ea8.ts.net",
      ],
    },
  },
};

export default nextConfig;
