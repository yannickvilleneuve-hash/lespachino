import type { SnapshotVehicle } from "@/lib/catalog/read";

/**
 * How many trucks the home-page strip shows.
 *
 * Eight is a teaser: enough that the strip clearly scrolls, few enough that the
 * accueil does not load the whole inventory's photos. The full list lives on
 * /inventaire, one click away.
 */
export const CAROUSEL_LIMIT = 8;

/**
 * PURE: the first `limit` vehicles, in the order given.
 *
 * Sorting belongs to the caller — `listOnlineVehicles()` already returns newest
 * first — so this stays a slice with a guard.
 *
 * The guard is the point: `slice(0, -1)` would quietly drop the LAST vehicle and
 * return twenty of them, which reads as "working" right up until someone passes
 * a computed limit that went negative.
 */
export function pickCarouselVehicles(
  rows: SnapshotVehicle[],
  limit: number = CAROUSEL_LIMIT,
): SnapshotVehicle[] {
  if (limit <= 0) return [];
  return rows.slice(0, limit);
}
