import { fetchPublicListings } from "@/lib/listings/public";
import { buildGoogleVlaFeed } from "@/lib/feeds/google-vla";

export const dynamic = "force-dynamic";
export const revalidate = 300;

/**
 * Feed canonique Google Vehicle Listings Ads (RSS + g: namespace).
 * Format accepté par: Google VLA, Meta/Facebook, la plupart des agrégateurs
 * automotive qui supportent RSS vehicle listings.
 */
export async function GET(request: Request) {
  const listings = await fetchPublicListings();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const xml = buildGoogleVlaFeed({ origin, listings });
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
