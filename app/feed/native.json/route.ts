import { fetchPublicListings } from "@/lib/listings/public";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export async function GET(request: Request) {
  const listings = await fetchPublicListings();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  return NextResponse.json(
    {
      generator: "camion-hino.ca",
      generated_at: new Date().toISOString(),
      count: listings.length,
      items: listings.map((l) => ({
        unit: l.unit,
        vin: l.vin,
        year: l.year,
        make: l.make,
        model: l.model,
        category: l.category,
        color: l.color,
        km: l.km,
        price_cad: l.price_cad,
        description_fr: l.description_fr,
        detail_url: `${origin}/vehicule/${encodeURIComponent(l.unit)}`,
        hero_image_url: l.hero_url,
        photo_count: l.photo_count,
      })),
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    },
  );
}
