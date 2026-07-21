import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { resolveFeedOrigin } from "@/lib/feeds/origin";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const origin = resolveFeedOrigin(
    process.env.FEED_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_URL,
    {
      forwardedHost: h.get("x-forwarded-host"),
      forwardedProto: h.get("x-forwarded-proto"),
      host: h.get("host"),
    },
  );

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/vehicule"],
        disallow: ["/dashboard", "/inventaire", "/auth/", "/api/"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
