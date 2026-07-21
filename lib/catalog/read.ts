import { createAdminClient } from "@/lib/supabase/admin";
import { publicPhotoUrl } from "@/lib/catalog/photos";
import { siteVisible } from "@/lib/catalog/visibility";
import { resolveIntervalSec } from "@/lib/catalog/sync-config";
import type { CatalogVehicle } from "@/lib/catalog/types";

export interface SnapshotPhoto {
  position: number;
  sourceUrl: string;
  storagePath: string | null;
}

export interface SnapshotVehicle {
  vehicle: CatalogVehicle;
  status: "online" | "sold";
  photos: SnapshotPhoto[];
}

interface PhotoRow {
  position: number;
  source_url: string;
  storage_path: string | null;
}

interface VehicleRow {
  id: string;
  payload: unknown;
  status: string;
  photos: PhotoRow[] | null;
}

/** Our mirrored copy when we have one, the LesPAC CDN when the mirror failed. */
export function photoSrc(p: SnapshotPhoto): string {
  return p.storagePath ? publicPhotoUrl(p.storagePath) : p.sourceUrl;
}

export function sortByYearDesc(rows: SnapshotVehicle[]): SnapshotVehicle[] {
  return [...rows].sort((a, b) => (b.vehicle.year ?? 0) - (a.vehicle.year ?? 0));
}

export function toSnapshotVehicle(row: VehicleRow): SnapshotVehicle {
  const photos = (row.photos ?? [])
    .map((p) => ({
      position: p.position,
      sourceUrl: p.source_url,
      storagePath: p.storage_path,
    }))
    .sort((a, b) => a.position - b.position);

  return {
    vehicle: row.payload as CatalogVehicle,
    status: row.status === "sold" ? "sold" : "online",
    photos,
  };
}

const SELECT = "id, payload, status, photos:catalog_photo(position, source_url, storage_path)";

/**
 * The public inventory: online vehicles that pass `siteVisible`, newest first.
 * One DB round-trip, versus the 20+ LesPAC calls a live fetch would cost.
 */
export async function listOnlineVehicles(): Promise<SnapshotVehicle[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("catalog_vehicle")
    .select(SELECT)
    .eq("status", "online");

  if (error) throw new Error(`snapshot read failed: ${error.message}`);

  const rows = ((data ?? []) as unknown as VehicleRow[]).map(toSnapshotVehicle);
  return sortByYearDesc(rows.filter((r) => siteVisible(r.vehicle)));
}

/**
 * One vehicle, sold ones included — an ad that left LesPAC still has links in
 * the wild (Google, Facebook, email), and a dead end serves nobody.
 */
export async function getSnapshotVehicle(id: string): Promise<SnapshotVehicle | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("catalog_vehicle")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`snapshot read failed: ${error.message}`);
  if (!data) return null;
  return toSnapshotVehicle(data as unknown as VehicleRow);
}

/* ------------------------------------------------------------------ */
/* Freshness of the snapshot itself                                    */
/* ------------------------------------------------------------------ */

/** The `catalog_sync` singleton, as the worker writes it. */
export interface SyncRow {
  ran_at: string;
  ok: boolean;
  count: number;
  error: string | null;
}

/**
 * - `fresh`   — the worker ran recently and succeeded.
 * - `stale`   — the last successful run is older than the threshold: the worker
 *               is dead, or `worker/dist` was wiped, or its key stopped working.
 * - `failing` — the worker ran and reported a failure.
 * - `unknown` — the row is missing or unreadable. Not a verdict, an absence of
 *               one; it must never be painted green.
 */
export type SyncHealth = "fresh" | "stale" | "failing" | "unknown";

export interface SyncStatus {
  health: SyncHealth;
  /** Seconds since `ran_at`, null when there is nothing to measure. */
  ageSec: number | null;
  ranAt: string | null;
  count: number | null;
  error: string | null;
  /** Age at which a snapshot is declared stale, in seconds. */
  thresholdSec: number;
}

/**
 * A run is late from time to time — LesPAC times out, a cycle overruns. Alarming
 * on one missed cycle would train the operator to ignore the tile, so we wait
 * for three.
 */
export const STALE_CYCLES = 3;

/** Staleness threshold derived from the worker's own cadence. */
export function staleThresholdSec(intervalSec?: number): number {
  const interval = intervalSec ?? resolveIntervalSec(process.env.CATALOG_SYNC_INTERVAL_SEC);
  return interval * STALE_CYCLES;
}

/**
 * PURE: a `catalog_sync` row plus "now" gives a health verdict. No database, no
 * clock of its own — pass both in so the dashboard and the tests agree.
 *
 * `ok === false` wins over age: a worker that runs every 15 minutes and fails
 * every time is fresh by the clock and useless in fact, and the error string is
 * what the operator actually needs to read.
 */
export function syncHealth(
  row: SyncRow | null | undefined,
  now: Date,
  thresholdSec: number = staleThresholdSec(),
): SyncStatus {
  if (!row || typeof row.ran_at !== "string") {
    return { health: "unknown", ageSec: null, ranAt: null, count: null, error: null, thresholdSec };
  }

  const ranMs = Date.parse(row.ran_at);
  if (!Number.isFinite(ranMs)) {
    return {
      health: "unknown",
      ageSec: null,
      ranAt: null,
      count: row.count ?? null,
      error: row.error ?? null,
      thresholdSec,
    };
  }

  // Clamp: a clock skew between the DB and this box must not read as "-3 s ago".
  const ageSec = Math.max(0, Math.round((now.getTime() - ranMs) / 1000));
  const health: SyncHealth = row.ok === false ? "failing" : ageSec > thresholdSec ? "stale" : "fresh";

  return {
    health,
    ageSec,
    ranAt: row.ran_at,
    count: typeof row.count === "number" ? row.count : null,
    error: row.error ?? null,
    thresholdSec,
  };
}

/** French, human: "il y a 4 minutes". Pure. */
export function formatAgeFr(ageSec: number | null): string {
  if (ageSec === null) return "date inconnue";
  const rtf = new Intl.RelativeTimeFormat("fr-CA", { numeric: "auto" });
  if (ageSec < 60) return rtf.format(-ageSec, "second");
  if (ageSec < 3600) return rtf.format(-Math.floor(ageSec / 60), "minute");
  if (ageSec < 86400) return rtf.format(-Math.floor(ageSec / 3600), "hour");
  return rtf.format(-Math.floor(ageSec / 86400), "day");
}

/**
 * Freshness of the snapshot, for the dashboard.
 *
 * Never throws: this feeds a page, and a dashboard that crashes because its
 * health tile could not read the health row is worse than no tile. A read
 * failure is itself a signal — it surfaces as `unknown`.
 */
export async function getSyncStatus(now: Date = new Date()): Promise<SyncStatus> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("catalog_sync")
      .select("ran_at, ok, count, error")
      .eq("id", 1)
      .maybeSingle();

    if (error) return syncHealth(null, now);
    return syncHealth(data as SyncRow | null, now);
  } catch {
    return syncHealth(null, now);
  }
}
