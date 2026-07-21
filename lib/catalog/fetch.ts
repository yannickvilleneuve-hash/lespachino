import { listAll, getByListingId } from "@/lib/lespac/client";
import { normalizeListing } from "@/lib/catalog/normalize";
import type { CatalogVehicle } from "@/lib/catalog/types";

/**
 * The dealer's live inventory: every ONLINE LesPAC listing, normalized.
 *
 * LesPAC's list endpoint returns summaries only (no price, photos, or
 * attributes), so each active listing costs one detail fetch. A 404 on detail is
 * a race with a deactivation — skip it rather than emit a half-listing into a
 * public feed.
 *
 * Statuses other than ONLINE (DEACTIVATED, EXPIRED, PENDING) are excluded: those
 * trucks are sold or pulled.
 */
export async function fetchCatalog(): Promise<CatalogVehicle[]> {
  const summaries = await listAll();
  const active = summaries.filter((s) => s.status === "ONLINE");

  const out: CatalogVehicle[] = [];
  for (const s of active) {
    const detail = await getByListingId(s.listingId);
    if (!detail) continue;
    out.push(normalizeListing(detail));
  }
  return out;
}

/**
 * One vehicle by LesPAC listingId. Null when unknown or no longer online.
 *
 * Hits the by-listingId endpoint directly — never `fetchCatalog()`, which would
 * issue one request per active listing to answer a single-vehicle page.
 *
 * A non-ONLINE listing is a sold or pulled truck: the crawler must see a 404,
 * not a live page for a vehicle we no longer have.
 */
export async function getVehicleById(
  id: string,
): Promise<CatalogVehicle | null> {
  const listingId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(listingId) || listingId <= 0) return null;

  const detail = await getByListingId(listingId);
  if (!detail || detail.status !== "ONLINE") return null;
  return normalizeListing(detail);
}
