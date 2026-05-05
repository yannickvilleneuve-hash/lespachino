import type { PublicListing } from "@/lib/listings/public";
import { publicPriceAmount, publicPriceLabel } from "@/lib/listings/display";
import { getDealerConfig } from "@/lib/dealer/config";

interface BuildCommercialTruckCsvOptions {
  origin: string;
  listings: Array<PublicListing & { hero_url: string }>;
}

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function titleFor(l: PublicListing): string {
  return `${l.year || ""} ${l.make} ${l.model}`.replace(/\s+/g, " ").trim();
}

function conditionFor(category: string): "new" | "used" {
  const c = category.toUpperCase();
  return c.includes("NEUF") || c.includes("NEUV") ? "new" : "used";
}

export function buildCommercialTruckCsv({
  origin,
  listings,
}: BuildCommercialTruckCsvOptions): string {
  const dealer = getDealerConfig();
  const headers = [
    "stock_number",
    "vin",
    "year",
    "make",
    "model",
    "title",
    "description",
    "category",
    "condition",
    "mileage_km",
    "price",
    "price_label",
    "currency",
    "availability",
    "detail_url",
    "primary_image_url",
    "photo_count",
    "exterior_color",
    "dealer_name",
    "address",
    "city",
    "region",
    "postal_code",
    "country",
    "contact_name",
    "contact_phone",
    "contact_email",
  ];

  const rows = listings.map((l) => {
    const title = titleFor(l);
    const detailUrl = `${origin}/vehicule/${encodeURIComponent(l.unit)}`;
    const contactName = [dealer.contact.firstName, dealer.contact.lastName]
      .filter(Boolean)
      .join(" ");
    return [
      l.unit,
      l.vin,
      l.year > 0 ? l.year : "",
      l.make,
      l.model,
      title,
      l.description_fr || `${title} - ${l.category}`,
      l.category,
      conditionFor(l.category),
      l.km > 0 ? l.km : "",
      publicPriceAmount(l.price_cad),
      publicPriceLabel(l.price_cad),
      "CAD",
      "available",
      detailUrl,
      l.hero_url,
      l.photo_count,
      l.color,
      dealer.name,
      dealer.address.addr1,
      dealer.address.city,
      dealer.address.region,
      dealer.address.postalCode,
      dealer.address.country,
      contactName,
      dealer.contact.phone,
      dealer.contact.email,
    ].map(csvEscape).join(",");
  });

  return [headers.join(","), ...rows].join("\n") + "\n";
}
