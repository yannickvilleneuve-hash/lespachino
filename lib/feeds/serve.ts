import { headers } from "next/headers";
import { fetchCatalog } from "@/lib/catalog/fetch";
import { selectEligible } from "@/lib/feeds/eligibility";
import { resolveFeedOrigin } from "@/lib/feeds/origin";
import { chooseFeedSource } from "@/lib/feeds/floor";
import { snapshotCatalog } from "@/lib/feeds/snapshot-source";
import type { CatalogVehicle } from "@/lib/catalog/types";

type FeedBuilder = (opts: {
  origin: string;
  vehicles: CatalogVehicle[];
}) => string;

/**
 * Every vehicle feed does the same four things: resolve the public origin, pull
 * the LesPAC catalog, drop what the platform would reject, and render the body.
 * Only the renderer and its content type differ (RSS XML vs CSV).
 */
export async function serveFeed(
  label: string,
  build: FeedBuilder,
  contentType = "application/xml; charset=utf-8",
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

  // Deux sources, jamais une seule: un LesPAC qui répond 200 avec une liste
  // vide viderait le catalogue Meta sans qu'aucune erreur n'apparaisse.
  const live = await fetchCatalog().catch((err) => {
    console.error(`[feed:${label}] lecture LesPAC en échec, repli sur le snapshot:`, err);
    return null;
  });
  const snapshot = await snapshotCatalog().catch((err) => {
    console.error(`[feed:${label}] snapshot illisible:`, err);
    return null;
  });

  const liveSel = live ? selectEligible(live) : null;
  const snapSel = snapshot ? selectEligible(snapshot) : null;
  const source = chooseFeedSource(liveSel?.eligible.length ?? 0, snapSel?.eligible.length ?? 0);

  if (source === "refuse") {
    // 503 et surtout PAS un 200 vide: Meta conserve sa dernière copie valide et
    // les publicités continuent de tourner pendant qu'on répare.
    console.error(
      `[feed:${label}] REFUS de servir: live=${liveSel?.eligible.length ?? "n/a"} ` +
        `snapshot=${snapSel?.eligible.length ?? "n/a"} — le catalogue distant garde sa copie`,
    );
    return new Response("feed indisponible", {
      status: 503,
      headers: { "Retry-After": "900", "Cache-Control": "no-store", "X-Feed-Source": "refuse" },
    });
  }

  const chosen = source === "live" ? liveSel! : snapSel!;
  const catalog = source === "live" ? live! : snapshot!;
  const { eligible, skipped, warnings } = chosen;

  if (source === "snapshot") {
    console.warn(
      `[feed:${label}] servi depuis le SNAPSHOT (${eligible.length} véhicules): ` +
        `le live n'en rendait que ${liveSel?.eligible.length ?? 0}`,
    );
  }

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
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=900, s-maxage=900",
      "X-Feed-Source": source,
      "X-Feed-Total": String(catalog.length),
      "X-Feed-Included": String(eligible.length),
      "X-Feed-Skipped": String(skipped.length),
      "X-Feed-Warnings": String(warnings.length),
    },
  });
}
