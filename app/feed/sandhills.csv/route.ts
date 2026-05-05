import { buildCommercialTruckCsv } from "@/lib/feeds/commercial-truck-csv";
import { fetchPublicListings, type PublicListing } from "@/lib/listings/public";

export const dynamic = "force-dynamic";
export const revalidate = 300;

export async function GET(request: Request) {
  const [truckpaper, marketbook] = await Promise.all([
    fetchPublicListings({ channel: "truckpaper" }),
    fetchPublicListings({ channel: "marketbook" }),
  ]);
  const byUnit = new Map<string, PublicListing>();
  for (const listing of [...truckpaper, ...marketbook]) {
    byUnit.set(listing.unit, listing);
  }
  const listings = [...byUnit.values()].filter(
    (l): l is PublicListing & { hero_url: string } => l.hero_url !== null,
  );
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  const body = buildCommercialTruckCsv({ origin, listings });
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Content-Disposition": 'inline; filename="sandhills-inventory.csv"',
    },
  });
}
