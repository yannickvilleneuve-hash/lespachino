import type { CatalogVehicle } from "@/lib/catalog/types";

/**
 * What earns a spot on our own website.
 *
 * Deliberately looser than `selectEligible()` in lib/feeds/eligibility.ts: Meta
 * and Google reject an item with no price, so the feeds drop it. We do not —
 * "prix à discuter" is a real truck a buyer can call about, and hiding it loses
 * a sale to satisfy a rule that is not ours.
 *
 * A photo is the one hard requirement: a card with no image sells nothing.
 */
export function siteVisible(v: CatalogVehicle): boolean {
  return v.isVehicle && v.photoUrls.length > 0;
}
