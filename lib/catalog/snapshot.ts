import { fetchCatalog } from "@/lib/catalog/fetch";
import type { CatalogFetchResult, CatalogVehicle } from "@/lib/catalog/types";
import { mirrorPhoto } from "@/lib/catalog/photos";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Json, TablesInsert } from "@/lib/supabase/types";

type SupabaseLike = ReturnType<typeof createAdminClient>;

export interface SyncResult {
  ok: boolean;
  written: number;
  sold: number;
  /** LesPAC detail calls this cycle cost. The number the worker logs. */
  detailFetches: number;
  error: string | null;
}

/**
 * A fetch path may return the bare lot or the richer incremental result.
 *
 * A bare array means every vehicle in it was just read from LesPAC — that is
 * what `fetchCatalog()` does — so all of them count as refreshed.
 */
export type CatalogFetcher = () => Promise<CatalogVehicle[] | CatalogFetchResult>;

function asFetchResult(raw: CatalogVehicle[] | CatalogFetchResult): CatalogFetchResult {
  if (!Array.isArray(raw)) return raw;
  return {
    vehicles: raw,
    detailFetches: raw.length,
    refreshedIds: raw.map((v) => v.id),
  };
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
 * `fetchAll` is injected: the worker passes `fetchCatalogIncremental`, which
 * reuses stored payloads instead of re-reading every LesPAC detail every cycle.
 * The `fetchCatalog` default is the full-sweep fallback.
 */
export async function runCatalogSync(
  supabase: SupabaseLike,
  fetchAll: CatalogFetcher = fetchCatalog,
): Promise<SyncResult> {
  let result: CatalogFetchResult;
  try {
    result = asFetchResult(await fetchAll());
  } catch (err) {
    return fail(supabase, err instanceof Error ? err.message : String(err));
  }

  const fresh = result.vehicles;
  // Only these had their LesPAC detail re-read this cycle. Everything else is a
  // reused payload, and stamping detail_fetched_at on a reused payload would
  // restart its TTL on data nobody re-read — the TTL would never expire again.
  const refreshed = new Set(result.refreshedIds);

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
    const row: TablesInsert<"catalog_vehicle"> = {
      id: v.id,
      payload: v as unknown as Json,
      status: "online",
      last_seen_at: now,
      sold_at: null,
    };
    // Omitted, not nulled: PostgREST only updates the columns present in the
    // body, so a reused payload keeps whatever detail_fetched_at it had.
    if (refreshed.has(v.id)) row.detail_fetched_at = now;

    const { error: vehicleErr } = await supabase.from("catalog_vehicle").upsert(row);
    note(`vehicle ${v.id}`, vehicleErr);

    // What we already mirrored, keyed by the URL it came from.
    const { data: existing, error: readErr } = await supabase
      .from("catalog_photo")
      .select("position, source_url, storage_path")
      .eq("vehicle_id", v.id);
    note(`photo read ${v.id}`, readErr);

    // Could not read what we already own. Carrying on would treat "I don't know"
    // as "I own nothing", re-mirror every photo, and — if the CDN is also having
    // a bad minute — overwrite good storage paths with null. Skip this vehicle's
    // photos for this cycle; the rows on disk stay correct and the next cycle
    // retries. The vehicle row itself is already up to date.
    if (readErr) continue;

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

  return {
    ok,
    written: fresh.length,
    sold: soldCount,
    detailFetches: result.detailFetches,
    error,
  };
}

async function fail(supabase: SupabaseLike, error: string): Promise<SyncResult> {
  await supabase.from("catalog_sync").upsert({
    id: 1,
    ran_at: new Date().toISOString(),
    ok: false,
    count: 0,
    error: error.slice(0, 500),
  });
  return { ok: false, written: 0, sold: 0, detailFetches: 0, error };
}
