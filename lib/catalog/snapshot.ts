import { fetchCatalog } from "@/lib/catalog/fetch";
import type { CatalogVehicle } from "@/lib/catalog/types";
import { mirrorPhoto } from "@/lib/catalog/photos";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

type SupabaseLike = ReturnType<typeof createAdminClient>;

export interface SyncResult {
  ok: boolean;
  written: number;
  sold: number;
  error: string | null;
}

/**
 * Refresh the read-only snapshot of the LesPAC catalog.
 *
 * The whole point of this function is the guard: an empty lot is NEVER written.
 * `fetchCatalog()` returns [] both when the dealer really has no trucks and when
 * the LesPAC token expired — and the second case is far more likely. Wiping the
 * snapshot on that would take the public site down and, once the feeds read from
 * here, would hand Meta an empty file. An empty meta.csv already froze the Meta
 * catalog once, on 2026-07-15. So: no lot, no write, previous snapshot survives.
 *
 * `fetchAll` is injectable for tests only; production always uses fetchCatalog.
 */
export async function runCatalogSync(
  supabase: SupabaseLike,
  fetchAll: () => Promise<CatalogVehicle[]> = fetchCatalog,
): Promise<SyncResult> {
  let fresh: CatalogVehicle[];
  try {
    fresh = await fetchAll();
  } catch (err) {
    return fail(supabase, err instanceof Error ? err.message : String(err));
  }

  if (fresh.length === 0) {
    return fail(supabase, "LesPAC a retourné un lot vide — snapshot conservé");
  }

  const now = new Date().toISOString();

  for (const v of fresh) {
    await supabase.from("catalog_vehicle").upsert({
      id: v.id,
      payload: v as unknown as Json,
      status: "online",
      last_seen_at: now,
      sold_at: null,
    });

    // Replace, don't accumulate: a seller who reorders or removes photos must
    // not leave orphan rows behind that would resurface on the card.
    await supabase.from("catalog_photo").delete().eq("vehicle_id", v.id);
    if (v.photoUrls.length > 0) {
      const rows = [];
      for (const [position, url] of v.photoUrls.entries()) {
        rows.push({
          vehicle_id: v.id,
          position,
          source_url: url,
          storage_path: await mirrorPhoto(supabase, v.id, position, url),
        });
      }
      await supabase.from("catalog_photo").upsert(rows);
    }
  }

  // Anything the fetch did not return is gone from LesPAC: sold, or deactivated
  // and about to be re-posted under a new listingId. Indistinguishable from here.
  const knownIds = fresh.map((v) => v.id);
  const { data: rows } = await supabase.from("catalog_vehicle").select("id, status");
  const soldCount = (rows ?? []).filter(
    (r) => r.status === "online" && !knownIds.includes(r.id),
  ).length;

  if (soldCount > 0) {
    await supabase
      .from("catalog_vehicle")
      .update({ status: "sold", sold_at: now })
      .eq("status", "online")
      .not("id", "in", `(${knownIds.join(",")})`);
  }

  await supabase
    .from("catalog_sync")
    .upsert({ id: 1, ran_at: now, ok: true, count: fresh.length, error: null });

  return { ok: true, written: fresh.length, sold: soldCount, error: null };
}

async function fail(supabase: SupabaseLike, error: string): Promise<SyncResult> {
  await supabase.from("catalog_sync").upsert({
    id: 1,
    ran_at: new Date().toISOString(),
    ok: false,
    count: 0,
    error: error.slice(0, 500),
  });
  return { ok: false, written: 0, sold: 0, error };
}
