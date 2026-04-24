import type { PublicListing } from "@/lib/listings/public";

/**
 * Builder de feed RSS 2.0 + namespace Google Merchant (`g:`).
 * Format reconnu par: Google Vehicle Listings Ads, Meta/Facebook Marketplace
 * Automotive Inventory Ads, et la plupart des agrégateurs automotive.
 */

interface DealerAddress {
  addr1: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

const DEFAULT_ADDRESS: DealerAddress = {
  addr1: "Centre du camion Hino",
  city: "Montréal",
  region: "QC",
  postalCode: "H0H 0H0",
  country: "CA",
};

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function mapStateOfVehicle(category: string): "NEW" | "USED" | "CPO" {
  const c = category.toUpperCase();
  if (c.includes("NEUF") || c.includes("NEUV")) return "NEW";
  if (c.includes("CERTIF")) return "CPO";
  return "USED";
}

function mapBodyStyle(category: string): string {
  const c = category.toUpperCase();
  if (c.includes("REMORQUE")) return "TRAILER";
  return "TRUCK";
}

export interface BuildFeedOptions {
  origin: string;
  listings: PublicListing[];
  title?: string;
  description?: string;
  address?: DealerAddress;
}

export function buildGoogleVlaFeed({
  origin,
  listings,
  title = "Centre du camion Hino — Inventaire",
  description = "Camions commerciaux Hino neufs et usagés, boîtes, remorques.",
  address = DEFAULT_ADDRESS,
}: BuildFeedOptions): string {
  const items = listings
    .map((l) => {
      const vehicleTitle = `${l.year} ${l.make} ${l.model}`.trim();
      const desc = l.description_fr || `${vehicleTitle} — ${l.category}`;
      const url = `${origin}/vehicule/${encodeURIComponent(l.unit)}`;
      const state = mapStateOfVehicle(l.category);
      const body = mapBodyStyle(l.category);
      const condition = state === "NEW" ? "new" : "used";

      return `  <item>
    <g:vehicle_id>${xmlEscape(l.unit)}</g:vehicle_id>
    <title>${xmlEscape(vehicleTitle)}</title>
    <description>${xmlEscape(desc)}</description>
    <link>${xmlEscape(url)}</link>
    <g:image_link>${xmlEscape(l.hero_url)}</g:image_link>
    <g:make>${xmlEscape(l.make)}</g:make>
    <g:model>${xmlEscape(l.model)}</g:model>
    <g:year>${l.year > 0 ? l.year : ""}</g:year>
    <g:mileage>
      <g:value>${Math.max(0, Math.round(l.km))}</g:value>
      <g:unit>KM</g:unit>
    </g:mileage>
    <g:price>${(Math.round(l.price_cad * 100) / 100).toFixed(2)} CAD</g:price>
    <g:state_of_vehicle>${state}</g:state_of_vehicle>
    <g:condition>${condition}</g:condition>
    <g:availability>in stock</g:availability>
    <g:body_style>${body}</g:body_style>
    ${l.vin ? `<g:vin>${xmlEscape(l.vin)}</g:vin>` : ""}
    ${l.color ? `<g:exterior_color>${xmlEscape(l.color)}</g:exterior_color>` : ""}
    <g:address>
      <g:addr1>${xmlEscape(address.addr1)}</g:addr1>
      <g:city>${xmlEscape(address.city)}</g:city>
      <g:region>${xmlEscape(address.region)}</g:region>
      <g:postal_code>${xmlEscape(address.postalCode)}</g:postal_code>
      <g:country>${xmlEscape(address.country)}</g:country>
    </g:address>
  </item>`;
    })
    .join("\n");

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
