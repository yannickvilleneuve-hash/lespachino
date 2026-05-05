import { fetchPublicListings, type PublicListing } from "@/lib/listings/public";
import { isGooglePushReady } from "./push";

export interface GoogleVlaDiagnostics {
  configured: boolean;
  feed_url: string;
  native_count: number;
  google_selected_count: number;
  google_feed_ready_count: number;
  google_ready_available_count: number;
  selected_missing_price: string[];
  selected_missing_photo: string[];
  merchant_id: string | null;
  datafeed_id: string | null;
}

function publicOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://feeds.hinochicoutimi.com";
}

function hasHeroAndPrice(
  listing: PublicListing,
): listing is PublicListing & { hero_url: string } {
  return listing.hero_url !== null && listing.price_cad > 0;
}

export async function fetchGoogleVlaDiagnostics(): Promise<GoogleVlaDiagnostics> {
  const [nativeListings, googleListings] = await Promise.all([
    fetchPublicListings({ channel: "native" }),
    fetchPublicListings({ channel: "google_vla" }),
  ]);
  return {
    configured: isGooglePushReady(),
    feed_url: new URL("/feed/vehicles.xml", publicOrigin()).toString(),
    native_count: nativeListings.length,
    google_selected_count: googleListings.length,
    google_feed_ready_count: googleListings.filter(hasHeroAndPrice).length,
    google_ready_available_count: nativeListings.filter(hasHeroAndPrice).length,
    selected_missing_price: googleListings
      .filter((l) => l.price_cad <= 0)
      .map((l) => l.unit),
    selected_missing_photo: googleListings
      .filter((l) => l.hero_url === null)
      .map((l) => l.unit),
    merchant_id: process.env.GOOGLE_MERCHANT_ID ?? null,
    datafeed_id: process.env.GOOGLE_DATAFEED_ID ?? null,
  };
}
