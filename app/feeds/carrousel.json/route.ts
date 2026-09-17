import { headers } from "next/headers";
import { listOnlineVehicles } from "@/lib/catalog/read";
import { pickCarouselVehicles } from "@/lib/catalog/carousel";
import { buildCarouselJson } from "@/lib/catalog/carousel-json";
import { resolveFeedOrigin } from "@/lib/feeds/origin";

/**
 * The home-page strip as data, for camion-hino.ca to render itself.
 *
 * Why this exists: framing /vehicule/carrousel from WordPress costs the visitor
 * ~20 round-trips through the tunnel (HTML, chunks, fonts, then images), each
 * one ~0.8 s, and the strip only starts loading once scrolled into view. With
 * this endpoint WordPress fetches ONE small JSON every few minutes, caches it,
 * and prints the cards in its own HTML — zero extra requests for the visitor,
 * and the home page keeps its last good copy if this server is unreachable.
 *
 * Lives under /feeds on purpose: that path already passes the Cloudflare
 * whitelist (`^/(feeds|_next|vehicule)(/|$)`), so no tunnel edit is needed.
 */
export const revalidate = 300;

const INVENTORY_URL = process.env.SITE_INVENTORY_URL ?? "https://camion-hino.ca/inventaire";

export async function GET() {
  const h = await headers();
  const origin = resolveFeedOrigin(process.env.FEED_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_URL, {
    forwardedHost: h.get("x-forwarded-host"),
    forwardedProto: h.get("x-forwarded-proto"),
    host: h.get("host"),
  });

  try {
    const rows = pickCarouselVehicles(await listOnlineVehicles());
    const body = buildCarouselJson({ rows, origin, inventoryUrl: INVENTORY_URL });
    return Response.json(body, {
      headers: {
        // Cloudflare + WordPress transient both honour this; the strip may lag
        // the inventory by five minutes, which nobody notices.
        "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    // 503, never a 200 with an empty list: the WordPress side keeps its last
    // valid copy on a non-200, but would happily render "no trucks" on a 200.
    console.error("[carrousel.json] snapshot read failed:", err);
    return new Response("carrousel indisponible", {
      status: 503,
      headers: { "Retry-After": "300", "Cache-Control": "no-store" },
    });
  }
}
