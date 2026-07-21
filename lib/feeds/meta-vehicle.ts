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
 *
 * Meta classifies an RSS catalog feed by the Google base namespace on <rss> and
 * the `g:` prefix on every field. Without it Meta cannot even recognize the file
 * ("format de fichier non pris en charge") — it never reaches field validation.
 * The vehicle fields themselves are Meta's own (vehicle_id, state_of_vehicle,
 * mileage.value/unit, image.url, address.component), per the Graph API vehicle
 * reference, but they still ride inside the `g:`-namespaced RSS envelope.
 *
 * Rebuilt 2026-07-10 on the LesPAC-backed catalog; `g:` envelope added 2026-07-13
 * after Meta rejected the namespace-less feed.
 */

const GOOGLE_NS = "http://base.google.com/ns/1.0";

export interface BuildMetaFeedOptions {
  /** Public origin serving /vehicule/<id>. Must be reachable by Meta's crawler. */
  origin: string;
  vehicles: CatalogVehicle[];
  title?: string;
  description?: string;
  address?: DealerAddress;
}

/** Indented `g:`-prefixed child element, or "" when the value is absent. */
function tag(name: string, value: string | number | null): string {
  if (value === null || value === "") return "";
  const rendered = typeof value === "number" ? String(value) : xmlEscape(value);
  return `    <g:${name}>${rendered}</g:${name}>`;
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

  // Meta wants every photo as its own <g:image><g:url>; the first is the hero.
  const images = v.photoUrls
    .map(
      (u) => `    <g:image>\n      <g:url>${xmlEscape(u)}</g:url>\n    </g:image>`,
    )
    .join("\n");

  const optional = [
    // A placeholder odometer is worse than none: see `hasPlausibleOdometer`.
    // Meta's mileage.unit enum is KILOMETERS / MILES (not "KM").
    hasPlausibleOdometer(v)
      ? `    <g:mileage>\n      <g:value>${Math.max(0, v.km as number)}</g:value>\n      <g:unit>KILOMETERS</g:unit>\n    </g:mileage>`
      : "",
    tag("exterior_color", v.exteriorColor),
    tag("transmission", v.transmission),
    tag("fuel_type", v.fuelType),
  ]
    .filter(Boolean)
    .join("\n");

  // No <g:condition>: Meta's condition enum is EXCELLENT/GOOD/... — new vs used
  // belongs in state_of_vehicle, which we already emit.
  // title/description/link are RSS-core (unprefixed) — Meta needs them to
  // recognize the document as RSS at all. Only the vehicle attributes take g:.
  // g:url is Meta's own vehicle URL field; <link> carries the same value so the
  // RSS envelope is valid either way.
  return `  <item>
    <g:vehicle_id>${xmlEscape(v.id)}</g:vehicle_id>
    <title>${xmlEscape(vehicleTitle)}</title>
    <description>${xmlEscape(v.description || vehicleTitle)}</description>
    <link>${xmlEscape(url)}</link>
    <g:url>${xmlEscape(url)}</g:url>
${images}
    <g:make>${xmlEscape(v.make)}</g:make>
    <g:model>${xmlEscape(v.model)}</g:model>
    <g:year>${v.year}</g:year>
${optional}
    <g:price>${price}</g:price>
    <g:state_of_vehicle>${v.isNew ? "NEW" : "USED"}</g:state_of_vehicle>
    <g:availability>available</g:availability>
    <g:body_style>${v.bodyStyle}</g:body_style>
    <g:address format="simple">
      <g:component name="addr1">${xmlEscape(address.addr1)}</g:component>
      <g:component name="city">${xmlEscape(address.city)}</g:component>
      <g:component name="region">${xmlEscape(address.region)}</g:component>
      <g:component name="postal_code">${xmlEscape(address.postalCode)}</g:component>
      <g:component name="country">${xmlEscape(address.country)}</g:component>
    </g:address>
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
<rss xmlns:g="${GOOGLE_NS}" version="2.0">
<channel>
  <title>${xmlEscape(title)}</title>
  <link>${xmlEscape(origin)}</link>
  <description>${xmlEscape(description)}</description>
${items}
</channel>
</rss>
`;
}
