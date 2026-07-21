import { createAdminClient } from "@/lib/supabase/admin";
import { publicPhotoUrl } from "@/lib/catalog/photos";
import { siteVisible } from "@/lib/catalog/visibility";
import { resolveIntervalSec } from "@/lib/catalog/sync-config";
import { getVehicleById } from "@/lib/catalog/fetch";
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
/* Resolving the vehicle page: snapshot first, live LesPAC as net       */
/* ------------------------------------------------------------------ */

/**
 * A live LesPAC vehicle, in the shape the page already consumes.
 *
 * `status` is "online" because `getVehicleById` only ever returns ONLINE
 * listings. Photos keep their LesPAC CDN URLs and a null `storagePath`: a
 * vehicle the worker has never seen has no mirrored copy, and `photoSrc`
 * already falls back to the source URL in exactly that case.
 */
export function liveAsSnapshotVehicle(vehicle: CatalogVehicle): SnapshotVehicle {
  return {
    vehicle,
    status: "online",
    photos: vehicle.photoUrls.map((sourceUrl, position) => ({
      position,
      sourceUrl,
      storagePath: null,
    })),
  };
}

/** Injected so the resolver is unit-testable without a database or a network. */
export interface ResolveVehicleDeps {
  fromSnapshot?: (id: string) => Promise<SnapshotVehicle | null>;
  fromLive?: (id: string) => Promise<CatalogVehicle | null>;
  /** Called when the live net actually caught a page the snapshot had missed. */
  onLiveHit?: (id: string) => void;
  onLiveError?: (id: string, err: unknown) => void;
}

/**
 * Worth a line: it means a visitor or a crawler reached a truck the snapshot did
 * not have yet. Rare and expected right after the dealer posts; frequent means
 * the worker is behind. Misses that resolve to nothing are not logged — those
 * are just bots probing junk ids.
 */
function logLiveHit(id: string): void {
  console.info(`[vehicule] ${id} served live: absent from the snapshot`);
}

function logLiveError(id: string, err: unknown): void {
  console.error(`[vehicule] live fallback failed for ${id}:`, err);
}

/**
 * The vehicle behind /vehicule/<id>, with the snapshot's staleness papered over.
 *
 * `/feeds/meta.csv` is built from a LIVE `fetchCatalog()`, so a truck the dealer
 * posts on LesPAC enters the Meta feed at once — while the snapshot only learns
 * about it at the next worker cycle, up to 15 minutes later. Without this
 * fallback, Meta's crawler and every early click land on `notFound()` for a
 * product Meta is already advertising, and the ad gets disapproved for a broken
 * landing page.
 *
 * The snapshot stays the primary source: it is one round-trip, it holds sold
 * vehicles the live API no longer returns, and it survives a LesPAC outage. The
 * live call is a miss-only net.
 *
 * A live failure degrades to null — i.e. a 404 — never to a 500: LesPAC being
 * down must not turn every unknown id into a server error page. No id-format
 * guard here on purpose; `getVehicleById` rejects non-numeric and non-positive
 * ids before touching the API.
 */
export async function resolveVehicleForPage(
  id: string,
  deps: ResolveVehicleDeps = {},
): Promise<SnapshotVehicle | null> {
  const fromSnapshot = deps.fromSnapshot ?? getSnapshotVehicle;
  const fromLive = deps.fromLive ?? getVehicleById;
  const onLiveHit = deps.onLiveHit ?? logLiveHit;
  const onLiveError = deps.onLiveError ?? logLiveError;

  const snapshot = await fromSnapshot(id);
  if (snapshot) return snapshot;

  try {
    const live = await fromLive(id);
    if (!live) return null;
    onLiveHit(id);
    return liveAsSnapshotVehicle(live);
  } catch (err) {
    onLiveError(id, err);
    return null;
  }
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
