import { fetchPublicListings } from "@/lib/listings/public";

export const dynamic = "force-dynamic";
export const revalidate = 300;

/**
 * Facebook Marketplace / Meta Automotive Inventory Ads catalog feed (RSS XML).
 * Utilise le namespace `g:` (Google Merchant Center) pris en charge par Meta.
 *
 * Doc référence Meta:
 *  - https://www.facebook.com/business/help/143781049600895 (Setup catalog)
 *  - https://www.facebook.com/business/help/328529297741092 (Required fields)
 *
 * Contrainte: véhicules USAGÉS doivent avoir mileage >= 500 MI / 805 KM OU
 * une plaque d'immatriculation. state_of_vehicle="NEW" contourne la limite.
 */

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

const ADDRESS = {
  addr1: "Centre du camion Hino",
  city: "Montréal",
  region: "QC",
  postal_code: "H0H 0H0",
  country: "CA",
};

export async function GET(request: Request) {
  const listings = await fetchPublicListings();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;

  const items = listings
    .map((l) => {
      const title = `${l.year} ${l.make} ${l.model}`.trim();
      const description = l.description_fr || `${title} — ${l.category}`;
      const url = `${origin}/vehicule/${encodeURIComponent(l.unit)}`;
      const state = mapStateOfVehicle(l.category);
      const body = mapBodyStyle(l.category);
      const condition = state === "NEW" ? "new" : "used";

      return `  <item>
    <g:vehicle_id>${xmlEscape(l.unit)}</g:vehicle_id>
    <title>${xmlEscape(title)}</title>
    <description>${xmlEscape(description)}</description>
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
      <g:addr1>${xmlEscape(ADDRESS.addr1)}</g:addr1>
      <g:city>${xmlEscape(ADDRESS.city)}</g:city>
      <g:region>${xmlEscape(ADDRESS.region)}</g:region>
      <g:postal_code>${xmlEscape(ADDRESS.postal_code)}</g:postal_code>
      <g:country>${xmlEscape(ADDRESS.country)}</g:country>
    </g:address>
  </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>Centre du camion Hino — Inventaire</title>
  <link>${origin}</link>
  <description>Camions commerciaux Hino neufs et usagés, boîtes, remorques.</description>
${items}
</channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
