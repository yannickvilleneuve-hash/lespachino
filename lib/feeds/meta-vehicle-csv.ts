import type { CatalogVehicle } from "@/lib/catalog/types";
import { getDealerConfig, type DealerAddress } from "@/lib/dealer/config";
import { feedTitle, formatFeedPrice, hasPlausibleOdometer } from "@/lib/feeds/eligibility";

/**
 * Meta Commerce Manager — Vehicles catalog feed, CSV flavour.
 *
 * Meta's Vehicles catalog reliably ingests CSV/TSV; its RSS-XML importer rejects
 * even a spec-valid `g:`-namespaced feed with a bare "format non pris en charge"
 * and an empty error report (see 2026-07-13 debugging). CSV removes the whole
 * XML-parsing ambiguity. Google VLA stays on RSS (Google's importer wants it).
 *
 * Field names and the JSON-encoded `image` / `address` columns follow Meta's
 * automotive catalog CSV spec.
 */

export interface BuildMetaCsvOptions {
  /** Public origin serving /vehicule/<id>. Must be reachable by Meta's crawler. */
  origin: string;
  vehicles: CatalogVehicle[];
  address?: DealerAddress;
}

/** Column order is fixed; every row emits a value (possibly empty) per column. */
const COLUMNS = [
  "vehicle_id",
  "title",
  "description",
  "url",
  "make",
  "model",
  "year",
  "mileage.value",
  "mileage.unit",
  "price",
  "state_of_vehicle",
  "availability",
  "body_style",
  "exterior_color",
  "transmission",
  "fuel_type",
  "image",
  "address",
] as const;

/** RFC 4180: wrap every field in quotes and double any embedded quote. */
function csvField(value: string | number | null): string {
  const s = value === null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function csvRow(values: Array<string | number | null>): string {
  return values.map(csvField).join(",");
}

function buildRow(
  v: CatalogVehicle,
  origin: string,
  address: DealerAddress,
): string {
  const url = `${origin}/vehicule/${encodeURIComponent(v.id)}`;
  // selectEligible guarantees price, year, make, and a photo are present.
  const price = formatFeedPrice(v.priceCad as number);

  // A placeholder odometer is worse than none: see `hasPlausibleOdometer`.
  const showKm = hasPlausibleOdometer(v);

  // Meta encodes images as a JSON array of {url} and the address as a JSON
  // object, both inside a single CSV column.
  const image = JSON.stringify(v.photoUrls.map((u) => ({ url: u })));
  const addressJson = JSON.stringify({
    addr1: address.addr1,
    city: address.city,
    region: address.region,
    postal_code: address.postalCode,
    country: address.country,
  });

  return csvRow([
    v.id,
    feedTitle(v),
    v.description || feedTitle(v),
    url,
    v.make,
    v.model,
    v.year,
    showKm ? Math.max(0, v.km as number) : "",
    showKm ? "KM" : "",
    price,
    v.isNew ? "NEW" : "USED",
    "available",
    v.bodyStyle,
    v.exteriorColor,
    v.transmission,
    v.fuelType,
    image,
    addressJson,
  ]);
}

/**
 * Pure: render the Meta Vehicles CSV feed.
 * Callers pass only eligible vehicles (see `selectEligible`).
 */
export function buildMetaVehicleCsv({
  origin,
  vehicles,
  address = getDealerConfig().address,
}: BuildMetaCsvOptions): string {
  const header = COLUMNS.join(",");
  const rows = vehicles.map((v) => buildRow(v, origin, address));
  // Trailing newline: some parsers drop a final row without it.
  return [header, ...rows].join("\n") + "\n";
}
