import type { CatalogVehicle } from "@/lib/catalog/types";
import { getDealerConfig, type DealerAddress } from "@/lib/dealer/config";
import {
  feedTitle,
  formatFeedPrice,
  hasPlausibleOdometer,
  xmlEscape,
} from "@/lib/feeds/eligibility";

/**
 * Meta Commerce Manager — Vehicles catalog feed.
 * RSS 2.0 without the Google `g:` namespace (Meta rejects Google VLA as-is).
 * Native Meta fields: vehicle_id, image_link, mileage.value/unit, address.component.
 *
 * Rebuilt 2026-07-10 on the LesPAC-backed catalog. The pre-pivot version read a
 * SERTI + Supabase listing shape that no longer exists.
 */

export interface BuildMetaFeedOptions {
  /** Public origin serving /vehicule/<id>. Must be reachable by Meta's crawler. */
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
  const vehicleTitle = feedTitle(v);
  const url = `${origin}/vehicule/${encodeURIComponent(v.id)}`;
  // selectEligible guarantees price, year, make, and a photo are present.
  const price = formatFeedPrice(v.priceCad as number);

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
 * Callers pass only eligible vehicles (see `selectEligible`).
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
