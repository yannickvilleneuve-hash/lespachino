import { createAdminClient } from "@/lib/supabase/admin";
import { fetchVehicleByUnit } from "@/lib/listings/queries";
import { publicPhotoUrl } from "@/lib/listings/public";
import { saveItem, removeItem, type WixInventoryItem } from "./client";

const BASE_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://camion-hino.ca";

export interface SyncResult {
  unit: string;
  action: "saved" | "removed" | "skipped" | "error";
  error?: string;
}

/** Wix _id accepte presque tout, mais sanitize pour être safe. */
function idFromUnit(unit: string): string {
  return unit.replace(/[^A-Za-z0-9_-]/g, "_");
}

function mapState(category: string): "NEW" | "USED" {
  const c = category.toUpperCase();
  return c.includes("NEUF") || c.includes("NEUV") ? "NEW" : "USED";
}

export async function syncAllToWix(): Promise<SyncResult[]> {
  const admin = createAdminClient();
  const { data: listings, error } = await admin
    .from("listing")
    .select("unit, is_published, hidden");
  if (error) throw new Error(`listings: ${error.message}`);

  const results: SyncResult[] = [];

  for (const l of listings) {
    const shouldPublish = l.is_published && !l.hidden;
    const wixId = idFromUnit(l.unit);
    try {
      if (shouldPublish) {
        const detail = await fetchVehicleByUnit(l.unit);
        if (!detail || detail.photos.length === 0) {
          results.push({
            unit: l.unit,
            action: "skipped",
            error: !detail ? "introuvable SERTI" : "aucune photo",
          });
          continue;
        }
        const photoUrls = detail.photos.map((p) => publicPhotoUrl(p.storage_path, "medium"));
        const heroPhoto = detail.photos.find((p) => p.is_hero) ?? detail.photos[0];
        const item: WixInventoryItem = {
          _id: wixId,
          title: `${detail.year} ${detail.make} ${detail.model}`.trim(),
          unit: detail.unit,
          vin: detail.vin,
          year: detail.year > 0 ? detail.year : null,
          make: detail.make,
          model: detail.model,
          category: detail.category,
          km: detail.km,
          color: detail.color,
          priceCad: detail.price_cad,
          descriptionFr: detail.description_fr,
          state: mapState(detail.category),
          heroImage: publicPhotoUrl(heroPhoto.storage_path, "medium"),
          imageUrls: photoUrls,
          detailUrl: `${BASE_SITE_URL}/vehicule/${encodeURIComponent(detail.unit)}`,
          dateAdded: detail.date_added ? new Date(detail.date_added).toISOString() : null,
        };
        await saveItem(item);
        results.push({ unit: l.unit, action: "saved" });
      } else {
        // Listing dépublié côté admin → retirer de Wix.
        try {
          await removeItem(wixId);
          results.push({ unit: l.unit, action: "removed" });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/→ 404:/.test(msg)) continue; // déjà absent
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
