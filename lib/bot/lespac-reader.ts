import { getByListingId, listAll } from "@/lib/lespac/client";
import type { NormalizedListing } from "@/lib/bot/types";

/**
 * Pull the dealer's currently active LesPAC listings and reduce each to the
 * fields we mirror. Only ONLINE listings are returned; the full content
 * (description, price, photos) is fetched from the per-listing detail.
 * `lespacId` is the LesPAC listing id as a string.
 */
export async function fetchActiveListings(): Promise<NormalizedListing[]> {
  const summaries = await listAll();
  const active = summaries.filter((s) => s.status === "ONLINE");

  const out: NormalizedListing[] = [];
  for (const s of active) {
    const detail = await getByListingId(s.listingId);
    if (!detail) continue; // 404 race — never emit a half-listing
    out.push({
      lespacId: String(s.listingId),
      title: detail.title,
      priceCad: detail.price ?? null,
      description: detail.description ?? "",
      photoUrls: detail.imageURLs ?? [],
    });
  }
  return out;
}
