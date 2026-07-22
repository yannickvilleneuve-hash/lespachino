import type { CatalogVehicle } from "@/lib/catalog/types";

/**
 * Year + make + model, falling back to the LesPAC title.
 *
 * Shared by the index grid and the home-page strip on purpose: two cards that
 * name the same truck differently look like two different trucks.
 */
export function displayTitle(v: CatalogVehicle): string {
  const parts = [v.year, v.make, v.model].filter((p) => p !== null && p !== "");
  return parts.join(" ").trim() || v.title;
}

/**
 * `null` means the dealer never set a price — say so in words. `0` is a price
 * someone typed, so it prints as $0 rather than hiding behind "à discuter".
 */
export function displayPrice(priceCad: number | null): string {
  if (priceCad == null) return "Prix à discuter";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(priceCad);
}
