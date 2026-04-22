import type { MetadataRoute } from "next";
import { fetchPublicListings } from "@/lib/listings/public";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://camion-hino.ca";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const listings = await fetchPublicListings();
  const now = new Date();

  return [
    { url: BASE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    ...listings.map((l) => ({
      url: `${BASE_URL}/vehicule/${encodeURIComponent(l.unit)}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
