import { headers } from "next/headers";
import { fetchCatalog } from "@/lib/catalog/fetch";
import { buildMetaVehicleFeed, selectMetaEligible } from "@/lib/feeds/meta-vehicle";
import { resolveFeedOrigin } from "@/lib/feeds/origin";

/**
 * Meta Commerce Manager pulls this on its own schedule. Rebuilding costs one
 * LesPAC list call plus one detail call per active listing, so cache it rather
 * than hammering LesPAC every time a crawler wakes up.
 */
export const revalidate = 900; // 15 min

export async function GET() {
  const h = await headers();
  const origin = resolveFeedOrigin(
    process.env.FEED_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_URL,
    {
      forwardedHost: h.get("x-forwarded-host"),
      forwardedProto: h.get("x-forwarded-proto"),
      host: h.get("host"),
    },
  );

  const catalog = await fetchCatalog();
  const { eligible, skipped, warnings } = selectMetaEligible(catalog);
  const xml = buildMetaVehicleFeed({ origin, vehicles: eligible });

  // Meta silently ignores rejected items. Our own exclusions are deliberate, so
  // say which listings were dropped and why — otherwise "only 20 of 25 trucks
  // are on Marketplace" becomes an unexplained mystery months from now.
  if (skipped.length > 0) {
    console.info(
      `[feed:meta] skipped ${skipped.length}/${catalog.length}: ` +
        skipped.map((s) => `${s.id} (${s.reason})`).join(", "),
    );
  }
  for (const w of warnings) {
    console.warn(`[feed:meta] ${w.id}: ${w.warning}`);
  }

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=900, s-maxage=900",
      "X-Feed-Total": String(catalog.length),
      "X-Feed-Included": String(eligible.length),
      "X-Feed-Skipped": String(skipped.length),
      "X-Feed-Warnings": String(warnings.length),
    },
  });
}
