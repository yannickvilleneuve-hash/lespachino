import type { CatalogVehicle } from "@/lib/catalog/types";
import { getDealerConfig, type DealerAddress } from "@/lib/dealer/config";
import {
  feedTitle,
  formatFeedPrice,
  hasPlausibleOdometer,
  xmlEscape,
} from "@/lib/feeds/eligibility";

/**
 * RSS 2.0 + Google Merchant namespace (`g:`).
 * Consumed by Google Vehicle Listings Ads and by most automotive aggregators.
 *
 * Not interchangeable with the Meta feed: Google wants `<link>` where Meta wants
 * `<url>`, `in stock` where Meta wants `available`, and every field namespaced.
 *
 * Restored 2026-07-10 from commit e6b834a^ and ported onto the LesPAC catalog.
 */

export interface BuildGoogleVlaFeedOptions {
  /** Public origin serving /vehicule/<id>. Must be reachable by Google's crawler. */
  origin: string;
  vehicles: CatalogVehicle[];
  title?: string;
  description?: string;
  address?: DealerAddress;
}

function tag(name: string, value: string | null): string {
  if (!value) return "";
  return `    <g:${name}>${xmlEscape(value)}</g:${name}>`;
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
    hasPlausibleOdometer(v)
      ? `    <g:mileage>\n      <g:value>${Math.max(0, v.km as number)}</g:value>\n      <g:unit>KM</g:unit>\n    </g:mileage>`
      : "",
    tag("exterior_color", v.exteriorColor),
    tag("transmission", v.transmission),
    tag("fuel_type", v.fuelType),
  ]
    .filter(Boolean)
    .join("\n");

  return `  <item>
    <g:vehicle_id>${xmlEscape(v.id)}</g:vehicle_id>
    <title>${xmlEscape(vehicleTitle)}</title>
    <description>${xmlEscape(v.description || vehicleTitle)}</description>
    <link>${xmlEscape(url)}</link>
    <g:image_link>${xmlEscape(v.photoUrls[0])}</g:image_link>
    <g:make>${xmlEscape(v.make)}</g:make>
    <g:model>${xmlEscape(v.model)}</g:model>
    <g:year>${v.year}</g:year>
${optional}
    <g:price>${price}</g:price>
    <g:state_of_vehicle>${v.isNew ? "NEW" : "USED"}</g:state_of_vehicle>
    <g:condition>${v.isNew ? "new" : "used"}</g:condition>
    <g:availability>in stock</g:availability>
    <g:body_style>${v.bodyStyle}</g:body_style>
    <g:address>
      <g:addr1>${xmlEscape(address.addr1)}</g:addr1>
      <g:city>${xmlEscape(address.city)}</g:city>
      <g:region>${xmlEscape(address.region)}</g:region>
      <g:postal_code>${xmlEscape(address.postalCode)}</g:postal_code>
      <g:country>${xmlEscape(address.country)}</g:country>
    </g:address>
  </item>`;
}

/** Pure: render the Google Vehicle Listings feed. */
export function buildGoogleVlaFeed({
  origin,
  vehicles,
  title = "Centre du camion Hino — Inventaire",
  description = "Camions commerciaux Hino neufs et usagés, boîtes, remorques.",
  address = getDealerConfig().address,
}: BuildGoogleVlaFeedOptions): string {
  const items = vehicles.map((v) => buildItem(v, origin, address)).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>${xmlEscape(title)}</title>
  <link>${xmlEscape(origin)}</link>
  <description>${xmlEscape(description)}</description>
${items}
</channel>
</rss>
`;
}
