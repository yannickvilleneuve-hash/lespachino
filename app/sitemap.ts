import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { resolveFeedOrigin } from "@/lib/feeds/origin";
import { listOnlineVehicles } from "@/lib/catalog/read";

export const revalidate = 900;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers();
  const origin = resolveFeedOrigin(
    process.env.FEED_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_URL,
    {
      forwardedHost: h.get("x-forwarded-host"),
      forwardedProto: h.get("x-forwarded-proto"),
      host: h.get("host"),
    },
  );

  // The home page redirects to /dashboard, which is 404 publicly — listing it
  // was the reason Google had nothing valid to crawl.
  const rows = await listOnlineVehicles();

  return [
    { url: `${origin}/vehicule`, changeFrequency: "daily", priority: 1 },
    ...rows.map((r) => ({
      url: `${origin}/vehicule/${r.vehicle.id}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
