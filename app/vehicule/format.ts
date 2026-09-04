import type { CatalogVehicle } from "@/lib/catalog/types";

/**
 * Public title = LesPAC listing title, copy-paste.
 *
 * Year/make/model attrs on LesPAC are often wrong (dropdown "Modèle", stale
 * year). The title is what the dealer typed and what buyers see on LesPAC —
 * the vitrine must match that string. Structured year/make/model stay on the
 * vehicle for Meta/Google feeds only.
 */
export function displayTitle(v: CatalogVehicle): string {
  const title = (v.title ?? "").trim();
  if (title) return title;
  const parts = [v.year, v.make, v.model].filter((p) => p !== null && p !== "");
  return parts.join(" ").trim();
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
