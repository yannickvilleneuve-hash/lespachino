import type { CatalogVehicle } from "@/lib/catalog/types";
import { getDealerConfig, type DealerAddress } from "@/lib/dealer/config";

/**
 * Meta Commerce Manager — Vehicles catalog feed.
 * RSS 2.0 without the Google `g:` namespace (Meta rejects Google VLA as-is).
 * Native Meta fields: vehicle_id, image_link, mileage.value/unit, address.component.
 *
 * Rebuilt 2026-07-10 on the LesPAC-backed catalog. The pre-pivot version read a
 * SERTI + Supabase listing shape that no longer exists.
 */

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Meta wants a fixed-point amount followed by the ISO currency code. */
export function formatMetaPrice(priceCad: number): string {
  return `${priceCad.toFixed(2)} CAD`;
}

export interface MetaEligibility {
  eligible: CatalogVehicle[];
  /** Items Meta would reject, with the reason. Surfaced, never silently dropped. */
  skipped: Array<{ id: string; reason: string }>;
  /** Items published with a field suppressed. The seller must fix the source. */
  warnings: Array<{ id: string; warning: string }>;
}

/**
 * A used vehicle showing under 100 km has a placeholder odometer, not a real
 * one: LesPAC listing 222013230 is a 2008 F750 with "Kilométrage: 10".
 *
 * Publishing that reads as fraud to a buyer, and Meta rejects dealer inventory
 * below a minimum odometer anyway. Pulling the truck from the feed would be
 * worse — it is genuinely for sale. So we publish it without a mileage field
 * (Meta treats mileage as optional) and name the listing so it gets fixed at
 * the source.
 */
export function hasPlausibleOdometer(v: CatalogVehicle): boolean {
  if (v.km == null) return false;
  if (v.isNew) return true;
  return v.km >= 100;
}

/**
 * Meta rejects a feed item outright when a required field is missing, and it
 * rejects the dealer's whole catalog if too many items fail. Filter here, and
 * report what was dropped rather than letting Commerce Manager discover it days
 * later.
 *
 * Required: a vehicle (not a cargo box), a price, at least one photo, a make,
 * and a year.
 */
export function selectMetaEligible(vehicles: CatalogVehicle[]): MetaEligibility {
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

export interface BuildMetaFeedOptions {
  /** Public origin serving /vehicule/<id>, e.g. https://feeds.hinochicoutimi.com */
  origin: string;
  vehicles: CatalogVehicle[];
  title?: string;
  description?: string;
  address?: DealerAddress;
}

/** Indented child element, or "" when the value is absent. */
function tag(name: string, value: string | number | null): string {
  if (value === null || value === "") return "";
  const rendered = typeof value === "number" ? String(value) : xmlEscape(value);
  return `    <${name}>${rendered}</${name}>`;
}

function buildItem(
  v: CatalogVehicle,
  origin: string,
  address: DealerAddress,
): string {
  const vehicleTitle = [v.year, v.make, v.model]
    .filter((p) => p !== null && p !== "")
    .join(" ")
    .trim();
  const url = `${origin}/vehicule/${encodeURIComponent(v.id)}`;
  // selectMetaEligible guarantees price, year, make, and a photo are present.
  const price = formatMetaPrice(v.priceCad as number);

  const optional = [
    // A placeholder odometer is worse than none: see `hasPlausibleOdometer`.
    hasPlausibleOdometer(v)
      ? `    <mileage>\n      <value>${Math.max(0, v.km as number)}</value>\n      <unit>KM</unit>\n    </mileage>`
      : "",
    tag("exterior_color", v.exteriorColor),
    tag("transmission", v.transmission),
    tag("fuel_type", v.fuelType),
  ]
    .filter(Boolean)
    .join("\n");

  return `  <item>
    <vehicle_id>${xmlEscape(v.id)}</vehicle_id>
    <title>${xmlEscape(vehicleTitle)}</title>
    <description>${xmlEscape(v.description || vehicleTitle)}</description>
    <url>${xmlEscape(url)}</url>
    <image_link>${xmlEscape(v.photoUrls[0])}</image_link>
    <make>${xmlEscape(v.make)}</make>
    <model>${xmlEscape(v.model)}</model>
    <year>${v.year}</year>
${optional}
    <price>${price}</price>
    <state_of_vehicle>${v.isNew ? "NEW" : "USED"}</state_of_vehicle>
    <condition>${v.isNew ? "new" : "used"}</condition>
    <availability>available</availability>
    <body_style>${v.bodyStyle}</body_style>
    <address format="simple">
      <component name="addr1">${xmlEscape(address.addr1)}</component>
      <component name="city">${xmlEscape(address.city)}</component>
      <component name="region">${xmlEscape(address.region)}</component>
      <component name="postal_code">${xmlEscape(address.postalCode)}</component>
      <component name="country">${xmlEscape(address.country)}</component>
    </address>
  </item>`;
}

/**
 * Pure: render the Meta Vehicles RSS feed.
 * Callers pass only eligible vehicles (see `selectMetaEligible`).
 */
export function buildMetaVehicleFeed({
  origin,
  vehicles,
  title = "Centre du camion Hino — Inventaire",
  description = "Camions commerciaux Hino neufs et usagés, boîtes, remorques.",
  address = getDealerConfig().address,
}: BuildMetaFeedOptions): string {
  const items = vehicles.map((v) => buildItem(v, origin, address)).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${xmlEscape(title)}</title>
  <link>${xmlEscape(origin)}</link>
  <description>${xmlEscape(description)}</description>
${items}
</channel>
</rss>
`;
}
