import { createAdminClient } from "@/lib/supabase/admin";
import { fetchVehicleByUnit } from "@/lib/listings/queries";
import { publicPhotoUrl } from "@/lib/listings/public";
import { mapToLespacListing } from "./mapping";
import * as client from "./client";

const BASE_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://camion-hino.ca";

export interface SyncResult {
  unit: string;
  action: "upserted" | "deactivated" | "error";
  listingId?: number;
  error?: string;
}

/** Synchronise tous les listings publiés vers Lespac (upsert).
 *  Les listings `is_published=false` ou `hidden=true` sont désactivés via
 *  l'API Lespac plutôt que supprimés (pour préserver les metrics côté Lespac). */
export async function syncAllToLespac(): Promise<SyncResult[]> {
  const admin = createAdminClient();

  const { data: listings, error } = await admin
    .from("listing")
    .select("unit, is_published, hidden")
    .order("unit");
  if (error) throw new Error(`listings fetch: ${error.message}`);

  const results: SyncResult[] = [];

  for (const l of listings) {
    const shouldPublish = l.is_published && !l.hidden;
    try {
      if (shouldPublish) {
        const detail = await fetchVehicleByUnit(l.unit);
        if (!detail) {
          results.push({
            unit: l.unit,
            action: "error",
            error: "véhicule introuvable SERTI",
          });
          continue;
        }
        if (detail.photos.length === 0) {
          results.push({
            unit: l.unit,
            action: "error",
            error: "aucune photo",
          });
          continue;
        }
        const photosWithUrls = detail.photos.map((p) => ({
          ...p,
          url: publicPhotoUrl(p.storage_path),
        }));
        const payload = mapToLespacListing({
          detail,
          photos: photosWithUrls,
          publicListingUrl: `${BASE_SITE_URL}/vehicule/${encodeURIComponent(l.unit)}`,
        });
        const resp = await client.upsertByVendorId(l.unit, payload);
        results.push({
          unit: l.unit,
          action: "upserted",
          listingId: resp.listingSummary?.listingId,
        });
      } else {
        // Listing dépublié côté admin → on désactive chez Lespac (idempotent).
        try {
          await client.deactivateByVendorId(l.unit);
          results.push({ unit: l.unit, action: "deactivated" });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // Si pas encore chez Lespac (404), c'est ok.
          if (/→ 404:/.test(msg)) continue;
          throw err;
        }
      }
    } catch (err) {
      results.push({
        unit: l.unit,
        action: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
