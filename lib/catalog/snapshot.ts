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
  // Every write is checked. Reporting ok:true after a failed write would make
  // catalog_sync — the only freshness signal an operator has — lie.
  const failures: string[] = [];
  const note = (what: string, error: { message: string } | null) => {
    if (error) failures.push(`${what}: ${error.message}`);
  };

  for (const v of fresh) {
    const { error: vehicleErr } = await supabase.from("catalog_vehicle").upsert({
      id: v.id,
      payload: v as unknown as Json,
      status: "online",
      last_seen_at: now,
      sold_at: null,
    });
    note(`vehicle ${v.id}`, vehicleErr);

    // What we already mirrored, keyed by the URL it came from.
    const { data: existing, error: readErr } = await supabase
      .from("catalog_photo")
      .select("position, source_url, storage_path")
      .eq("vehicle_id", v.id);
    note(`photo read ${v.id}`, readErr);

    const mirrored = new Map<string, string>();
    for (const row of existing ?? []) {
      if (row.storage_path) mirrored.set(row.source_url, row.storage_path);
    }

    const rows = [];
    for (const [position, url] of v.photoUrls.entries()) {
      // Reuse the copy we already own. Re-mirroring every cycle would re-download
      // and re-upload all 168 photos every 15 minutes, and — the real damage — a
      // transient LesPAC CDN failure would null a storage_path that points at a
      // perfectly good object still sitting in our bucket, sending the site back
      // to the very CDN that is down.
      const known = mirrored.get(url);
      const storagePath = known ?? (await mirrorPhoto(supabase, v.id, position, url));
      rows.push({
        vehicle_id: v.id,
        position,
        source_url: url,
        storage_path: storagePath ?? null,
      });
    }

    // Upsert first, prune after: deleting up front left a window of seconds —
    // one full mirroring pass — where the vehicle had no photo rows at all. A
    // page render landing in that window baked a photoless card into the ISR
    // cache for 5 minutes (15 on the detail page).
    if (rows.length > 0) {
      const { error: writeErr } = await supabase.from("catalog_photo").upsert(rows);
      note(`photo write ${v.id}`, writeErr);
    }
    const { error: pruneErr } = await supabase
      .from("catalog_photo")
      .delete()
      .eq("vehicle_id", v.id)
      .gte("position", v.photoUrls.length);
    note(`photo prune ${v.id}`, pruneErr);
  }

  // Anything the fetch did not return is gone from LesPAC: sold, or deactivated
  // and about to be re-posted under a new listingId. Indistinguishable from here.
  const knownIds = fresh.map((v) => v.id);
  const { data: rows, error: listErr } = await supabase
    .from("catalog_vehicle")
    .select("id, status");
  note("vehicle list", listErr);
  const soldCount = (rows ?? []).filter(
    (r) => r.status === "online" && !knownIds.includes(r.id),
  ).length;

  if (soldCount > 0) {
    const { error: soldErr } = await supabase
      .from("catalog_vehicle")
      .update({ status: "sold", sold_at: now })
      .eq("status", "online")
      .not("id", "in", `(${knownIds.join(",")})`);
    note("mark sold", soldErr);
  }

  const ok = failures.length === 0;
  const error = ok ? null : failures.join("; ").slice(0, 500);

  await supabase
    .from("catalog_sync")
    .upsert({ id: 1, ran_at: now, ok, count: fresh.length, error });

  return { ok, written: fresh.length, sold: soldCount, error };
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
