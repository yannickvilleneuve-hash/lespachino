import type { CatalogVehicle } from "@/lib/catalog/types";

/**
 * Shared gatekeeping for every vehicle feed. Meta, Google, and the aggregators
 * all reject an item missing a price, a photo, a make, or a year, and all of
 * them count a bare cargo box listed as a truck against the dealer.
 */

export interface FeedEligibility {
  eligible: CatalogVehicle[];
  /** Items a platform would reject, with the reason. Never silently dropped. */
  skipped: Array<{ id: string; reason: string }>;
  /** Items published with a field suppressed. The seller must fix the source. */
  warnings: Array<{ id: string; warning: string }>;
}

/**
 * A used vehicle showing under 100 km has a placeholder odometer, not a real
 * one: LesPAC listing 222013230 is a 2008 F750 with "Kilométrage: 10".
 *
 * Publishing that reads as fraud to a buyer, and Meta rejects used inventory
 * under 500 miles outright (new vehicles are exempt — see
 * docs/setup-feeds-externes.md). Pulling the truck from the feed would be worse:
 * it is genuinely for sale. So we publish it with no mileage field and name the
 * listing so it gets fixed at the source.
 */
export function hasPlausibleOdometer(v: CatalogVehicle): boolean {
  if (v.km == null) return false;
  if (v.isNew) return true;
  return v.km >= 100;
}

export function selectEligible(vehicles: CatalogVehicle[]): FeedEligibility {
  const eligible: CatalogVehicle[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];
  const warnings: Array<{ id: string; warning: string }> = [];

  for (const v of vehicles) {
    let reason: string | null = null;
    if (!v.isVehicle) reason = "not a vehicle (accessory / trailer category)";
    else if (v.priceCad == null) reason = "no price (prix à discuter)";
    else if (v.photoUrls.length === 0) reason = "no photo";
    else if (!v.make) reason = "no make";
    else if (v.year == null) reason = "no year";

    if (reason) {
      skipped.push({ id: v.id, reason });
      continue;
    }

    if (v.km != null && !hasPlausibleOdometer(v)) {
      warnings.push({
        id: v.id,
        warning: `implausible odometer (${v.km} km on a used ${v.year}) — mileage omitted, fix it on LesPAC`,
      });
    }
    eligible.push(v);
  }
  return { eligible, skipped, warnings };
}

/** Fixed-point amount plus the ISO currency code. Meta and Google agree here. */
export function formatFeedPrice(priceCad: number): string {
  return `${priceCad.toFixed(2)} CAD`;
}

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** The vehicle title platforms display: "2019 Ford E-450". */
export function feedTitle(v: CatalogVehicle): string {
  return [v.year, v.make, v.model]
    .filter((p) => p !== null && p !== "")
    .join(" ")
    .trim();
}
