import { fetchPublicListings, type PublicListing } from "@/lib/listings/public";
import { buildMetaVehicleFeed } from "@/lib/feeds/meta-vehicle";

export const dynamic = "force-dynamic";
export const revalidate = 300;

/**
 * Meta Commerce Manager — Vehicles catalog feed.
 * RSS 2.0 sans namespace `g:` (refusé par Meta en pratique). Champs Meta
 * natifs uniquement.
 */
export async function GET(request: Request) {
  const all = await fetchPublicListings();
  const listings = all.filter(
    (l): l is PublicListing & { hero_url: string } => l.hero_url !== null,
  );
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const xml = buildMetaVehicleFeed({ origin, listings });
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
