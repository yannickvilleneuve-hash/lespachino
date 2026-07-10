import { headers } from "next/headers";
import { fetchCatalog } from "@/lib/catalog/fetch";
import { selectEligible } from "@/lib/feeds/eligibility";
import { resolveFeedOrigin } from "@/lib/feeds/origin";
import type { CatalogVehicle } from "@/lib/catalog/types";

type FeedBuilder = (opts: {
  origin: string;
  vehicles: CatalogVehicle[];
}) => string;

/**
 * Every vehicle feed does the same four things: resolve the public origin, pull
 * the LesPAC catalog, drop what the platform would reject, and render XML. Only
 * the renderer differs.
 */
export async function serveFeed(
  label: string,
  build: FeedBuilder,
): Promise<Response> {
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
  const { eligible, skipped, warnings } = selectEligible(catalog);
  const xml = build({ origin, vehicles: eligible });

  // Platforms silently ignore rejected items. Our own exclusions are deliberate,
  // so say which listings were dropped and why — otherwise "only 20 of 25 trucks
  // are on Marketplace" becomes an unexplained mystery months from now.
  if (skipped.length > 0) {
    console.info(
      `[feed:${label}] skipped ${skipped.length}/${catalog.length}: ` +
        skipped.map((s) => `${s.id} (${s.reason})`).join(", "),
    );
  }
  for (const w of warnings) {
    console.warn(`[feed:${label}] ${w.id}: ${w.warning}`);
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
