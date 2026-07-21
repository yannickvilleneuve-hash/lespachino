import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "hino1-thinkcentre-m93p.tail0e1ea8.ts.net",
    "100.107.207.88",
    "ventes.hinochicoutimi.com",
    "feeds.hinochicoutimi.com",
  ],
  images: {
    // Exact hosts, never wildcards. `*.supabase.co` would let anyone spin up a
    // free Supabase project and use our public /_next/image endpoint as an open
    // image proxy — our domain, our CPU, our bandwidth, their content.
    remotePatterns: [
      {
        protocol: "https",
        hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://invalid.invalid")
          .hostname,
        pathname: "/storage/v1/object/public/vehicle-photos/**",
      },
      // The LesPAC CDN is the fallback when a photo has not been mirrored yet.
      { protocol: "https", hostname: "cdn.lespac.com" },
    ],
  },
  async headers() {
    return [
      {
        // Scoped to the inventory index on purpose: /feeds must not inherit a
        // CSP, and the vehicle detail page opens full-page, never framed.
        source: "/vehicule",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://camion-hino.ca https://www.camion-hino.ca",
          },
        ],
      },
    ];
  },
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
