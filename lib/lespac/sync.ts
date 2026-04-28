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

/** Sync ONE listing vers Lespac. Si shouldPublish, upsert; sinon deactivate. */
export async function syncOneToLespac(unit: string, shouldPublish: boolean): Promise<SyncResult> {
  try {
    if (shouldPublish) {
      const detail = await fetchVehicleByUnit(unit);
      if (!detail) return { unit, action: "error", error: "véhicule introuvable SERTI" };
      if (detail.photos.length === 0) return { unit, action: "error", error: "aucune photo" };
      const photosWithUrls = detail.photos.map((p) => ({
        ...p,
        url: publicPhotoUrl(p.storage_path, "medium"),
      }));
      const payload = mapToLespacListing({
        detail,
        photos: photosWithUrls,
        publicListingUrl: `${BASE_SITE_URL}/vehicule/${encodeURIComponent(unit)}`,
      });
      const resp = await client.upsertByVendorId(unit, payload);
      return { unit, action: "upserted", listingId: resp.listingSummary?.listingId };
    }
    try {
      await client.deactivateByVendorId(unit);
      return { unit, action: "deactivated" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/→ 404:/.test(msg)) return { unit, action: "deactivated" }; // déjà absent
      throw err;
    }
  } catch (err) {
    return {
      unit,
      action: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
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
    results.push(await syncOneToLespac(l.unit, shouldPublish));
  }
  return results;
}
