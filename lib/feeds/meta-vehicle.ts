import type { PublicListing } from "@/lib/listings/public";

/**
 * Meta Commerce Manager — Vehicles catalog feed.
 * RSS 2.0 sans namespace `g:` (Meta n'accepte pas Google VLA tel quel).
 * Champs natifs Meta: vehicle_id, image_link, mileage.value/unit, address.component.
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
  if (c.includes("REMORQUE")) return "OTHER";
  return "TRUCK";
}

export interface BuildMetaFeedOptions {
  origin: string;
  listings: PublicListing[];
  title?: string;
  description?: string;
  address?: DealerAddress;
}

export function buildMetaVehicleFeed({
  origin,
  listings,
  title = "Centre du camion Hino — Inventaire",
  description = "Camions commerciaux Hino neufs et usagés, boîtes, remorques.",
  address = DEFAULT_ADDRESS,
}: BuildMetaFeedOptions): string {
  const items = listings
    .map((l) => {
      const vehicleTitle = `${l.year} ${l.make} ${l.model}`.trim();
      const desc = l.description_fr || `${vehicleTitle} — ${l.category}`;
      const url = `${origin}/vehicule/${encodeURIComponent(l.unit)}`;
      const state = mapStateOfVehicle(l.category);
      const body = mapBodyStyle(l.category);
      const condition = state === "NEW" ? "new" : "used";
      const km = Math.max(0, Math.round(l.km));

      return `  <item>
    <vehicle_id>${xmlEscape(l.unit)}</vehicle_id>
    <title>${xmlEscape(vehicleTitle)}</title>
    <description>${xmlEscape(desc)}</description>
    <url>${xmlEscape(url)}</url>
    <image_link>${xmlEscape(l.hero_url)}</image_link>
    <make>${xmlEscape(l.make)}</make>
    <model>${xmlEscape(l.model)}</model>
    <year>${l.year > 0 ? l.year : ""}</year>
    <mileage>
      <value>${km}</value>
      <unit>KM</unit>
    </mileage>
    <price>${(Math.round(l.price_cad * 100) / 100).toFixed(2)} CAD</price>
    <state_of_vehicle>${state}</state_of_vehicle>
    <condition>${condition}</condition>
    <availability>available</availability>
    <body_style>${body}</body_style>
    ${l.vin ? `<vin>${xmlEscape(l.vin)}</vin>` : ""}
    ${l.color ? `<exterior_color>${xmlEscape(l.color)}</exterior_color>` : ""}
    <address format="simple">
      <component name="addr1">${xmlEscape(address.addr1)}</component>
      <component name="city">${xmlEscape(address.city)}</component>
      <component name="region">${xmlEscape(address.region)}</component>
      <component name="postal_code">${xmlEscape(address.postalCode)}</component>
      <component name="country">${xmlEscape(address.country)}</component>
    </address>
  </item>`;
    })
    .join("\n");

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
