import { fetchPublicListings, type PublicListing } from "@/lib/listings/public";
import { PUBLIC_PRICE_LABEL } from "@/lib/listings/display";
import { getDealerConfig } from "@/lib/dealer/config";

export const dynamic = "force-dynamic";
export const revalidate = 300;

/**
 * Facebook Marketplace / Meta Automotive Inventory Ads catalog feed.
 * Format CSV, headers en anglais, champs tels que Meta les attend.
 * Doc référence (accès dealer requis): https://www.facebook.com/business/help/143781049600895
 *
 * Contraintes connues:
 * - Mileage minimum 805 km (500 mi) pour VÉHICULES USAGÉS. Les camions neufs
 *   (~10 km) peuvent être rejetés — state_of_vehicle="NEW" les exempte.
 * - state_of_vehicle: "NEW" | "USED" | "CPO".
 * - condition: "new" | "used".
 * - availability: "in stock" | "out of stock" | "preorder".
 */

function csvEscape(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function mapState(category: string): "NEW" | "USED" | "CPO" {
  const c = category.toUpperCase();
  // SERTI tronque parfois à 20 chars: "BOITE DE CAMION NEUV" ou "CAMION NEUF".
  if (c.includes("NEUF") || c.includes("NEUV")) return "NEW";
  if (c.includes("CERTIF")) return "CPO";
  return "USED";
}

function mapBodyStyle(category: string): string {
  const c = category.toUpperCase();
  if (c.includes("REMORQUE")) return "TRAILER";
  if (c.includes("BOITE")) return "TRUCK";
  return "TRUCK";
}

export async function GET(request: Request) {
  const all = await fetchPublicListings({ channel: "fb_marketplace" });
  const listings = all.filter(
    (l): l is PublicListing & { hero_url: string } => l.hero_url !== null,
  );
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const dealer = getDealerConfig();

  const headers = [
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
    "currency",
    "state_of_vehicle",
    "condition",
    "availability",
    "image[0].url",
    "vin",
    "exterior_color",
    "body_style",
    "address.addr1",
    "address.city",
    "address.region",
    "address.postal_code",
    "address.country",
  ];

  const rows: string[] = [headers.join(",")];

  for (const l of listings) {
    const title = `${l.year} ${l.make} ${l.model}`.trim();
    const url = `${origin}/vehicule/${encodeURIComponent(l.unit)}`;
    const state = mapState(l.category);
    const condition = state === "NEW" ? "new" : "used";
    const body = mapBodyStyle(l.category);
    const description = l.description_fr || `${title} — ${l.category}`;

    const row = [
      l.unit,
      title,
      description,
      url,
      l.make,
      l.model,
      l.year > 0 ? String(l.year) : "",
      l.km > 0 ? String(l.km) : "0",
      "KM",
      PUBLIC_PRICE_LABEL,
      "",
      state,
      condition,
      "in stock",
      l.hero_url,
      l.vin,
      l.color || "",
      body,
      dealer.address.addr1,
      dealer.address.city,
      dealer.address.region,
      dealer.address.postalCode,
      dealer.address.country,
    ].map(csvEscape);

    rows.push(row.join(","));
  }

  const body = rows.join("\n") + "\n";
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Content-Disposition": 'inline; filename="facebook-inventory.csv"',
    },
  });
}
