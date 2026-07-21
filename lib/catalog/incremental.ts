import { listAll, getByListingId } from "@/lib/lespac/client";
import { normalizeListing } from "@/lib/catalog/normalize";
import {
  resolveDetailBudget,
  resolveDetailTtlSec,
} from "@/lib/catalog/sync-config";
import type { CatalogFetchResult, CatalogVehicle } from "@/lib/catalog/types";
import type { LespacListing, LespacListingSummary } from "@/lib/lespac/types";
import type { createAdminClient } from "@/lib/supabase/admin";

type SupabaseLike = ReturnType<typeof createAdminClient>;

/** A snapshot row, reduced to what the decision needs. */
interface SnapshotRow {
  id: string;
  payload: unknown;
  detail_fetched_at: string | null;
}

export interface IncrementalDeps {
  listAll?: () => Promise<LespacListingSummary[]>;
  getByListingId?: (listingId: number) => Promise<LespacListing | null>;
  /** Now, in ms. Injected by tests so the TTL can be exercised without waiting. */
  now?: number;
  ttlSec?: number;
  budget?: number;
}

/** Why a listing is a candidate for a detail fetch. Lower tier wins the budget. */
const TIER_UNKNOWN = 0; // no stored payload at all — nothing to reuse
const TIER_CHANGED = 1; // the summary title moved: a real, observed change
const TIER_STALE = 2; // TTL elapsed: speculative, may well be a no-op

/**
 * Stand-in for "never fetched", so such a row sorts ahead of every real
 * timestamp. NOT -Infinity: two never-fetched rows would then compare
 * `-Infinity - -Infinity` = NaN, and a NaN comparator makes `sort` undefined.
 */
const NEVER_FETCHED_MS = Number.MIN_SAFE_INTEGER;

interface Candidate {
  summary: LespacListingSummary;
  tier: number;
  /** `detail_fetched_at` as ms, or NEVER_FETCHED_MS. Oldest wins the budget. */
  fetchedAtMs: number;
}

/**
 * A stored payload is only reusable if it still looks like a CatalogVehicle.
 * A row truncated or hand-edited into garbage must be re-fetched, not shipped.
 */
function usablePayload(payload: unknown): CatalogVehicle | null {
  if (!payload || typeof payload !== "object") return null;
  const v = payload as Partial<CatalogVehicle>;
  if (typeof v.id !== "string" || v.id === "") return null;
  if (typeof v.title !== "string") return null;
  if (!Array.isArray(v.photoUrls)) return null;
  return payload as CatalogVehicle;
}

/**
 * The worker's fetch path: the same ONLINE lot as `fetchCatalog()`, assembled
 * from as few LesPAC detail calls as possible.
 *
 * WHY THIS EXISTS. `fetchCatalog()` costs 1 `listAll` + one `getByListingId`
 * per active listing. At a 900 s cadence and 24 listings that is 96 x 25 = 2400
 * requests a day, forever, on the SAME token the live Meta feed reads through.
 * Nobody knows LesPAC's rate limit; discovering it would take the feed down.
 *
 * WHAT IT COSTS INSTEAD. 1 `listAll` per cycle (96/day) plus at most `budget`
 * details, and in steady state only what the TTL actually expires — 24 listings
 * on a 3600 s TTL is 24 details an hour, ~670 requests a day.
 *
 * WHAT IT CANNOT DO. `LespacListingSummary` carries only listingId, vendorId,
 * title, state and status. No price, no photos, no modified date. So a price cut
 * or a new photo is INVISIBLE from the list endpoint, and the TTL — not a change
 * signal — is what bounds how stale the site can be. The title comparison is the
 * one real change signal available, and it is worth having (the seller retitles
 * when the truck changes), but it is not a substitute for the TTL.
 *
 * `deps` is injectable for tests only; production uses the real LesPAC client.
 */
export async function fetchCatalogIncremental(
  supabase: SupabaseLike,
  deps: IncrementalDeps = {},
): Promise<CatalogFetchResult> {
  const list = deps.listAll ?? listAll;
  const getDetail = deps.getByListingId ?? getByListingId;
  const nowMs = deps.now ?? Date.now();
  const ttlSec = deps.ttlSec ?? resolveDetailTtlSec(process.env.CATALOG_DETAIL_TTL_SEC);
  const budget = deps.budget ?? resolveDetailBudget(process.env.CATALOG_DETAIL_BUDGET);

  // No catch here on purpose. A throw carries the real reason ("401: token
  // expired", "429"), and `runCatalogSync` already turns it into a refusal to
  // write with that message intact. Swallowing it into an empty lot would keep
  // the guard but replace the diagnosis with "LesPAC a retourné un lot vide".
  // Either way NOTHING is written and no stored payload is passed off as fresh.
  const summaries = await list();
  const online = summaries.filter((s) => s.status === "ONLINE");
  if (online.length === 0) {
    // Same guard as fetchCatalog: an empty lot is far more often an expired
    // token than a dealer with no trucks. Return nothing and let runCatalogSync
    // refuse to write; do NOT hand back stored payloads, which would look like a
    // healthy cycle and keep the snapshot marked fresh forever.
    return { vehicles: [], detailFetches: 0, refreshedIds: [], retainIds: [] };
  }

  const stored = await readSnapshot(supabase);

  // Everything we could ship without touching LesPAC, keyed by listingId.
  const reusable = new Map<number, CatalogVehicle>();
  const candidates: Candidate[] = [];

  for (const s of online) {
    const row = stored.get(String(s.listingId));
    const payload = usablePayload(row?.payload);

    if (!payload) {
      candidates.push({ summary: s, tier: TIER_UNKNOWN, fetchedAtMs: NEVER_FETCHED_MS });
      continue;
    }
    reusable.set(s.listingId, payload);

    const parsed = row?.detail_fetched_at ? Date.parse(row.detail_fetched_at) : Number.NaN;
    // NULL — or an unparseable timestamp — means "never fetched": oldest possible.
    const fetchedAtMs = Number.isFinite(parsed) ? parsed : NEVER_FETCHED_MS;

    if (payload.title !== s.title) {
      candidates.push({ summary: s, tier: TIER_CHANGED, fetchedAtMs });
    } else if (nowMs - fetchedAtMs >= ttlSec * 1000) {
      candidates.push({ summary: s, tier: TIER_STALE, fetchedAtMs });
    }
  }

  // Unknown ids first — they have no payload to fall back on, so a clipped one
  // is simply absent from the site this cycle. Then observed title changes, then
  // plain TTL expiry. Oldest `detail_fetched_at` first within each tier.
  candidates.sort((a, b) => a.tier - b.tier || a.fetchedAtMs - b.fetchedAtMs);

  const attempted = candidates.slice(0, budget);
  const attemptedIds = new Set(attempted.map((c) => String(c.summary.listingId)));

  const fresh = new Map<number, CatalogVehicle>();
  const refreshedIds: string[] = [];
  for (const c of attempted) {
    const detail = await getDetail(c.summary.listingId);
    // 404 = race with a deactivation. Skip it, exactly like fetchCatalog: a
    // half-listing must never reach a public feed.
    if (!detail) continue;
    const v = normalizeListing(detail);
    fresh.set(c.summary.listingId, v);
    refreshedIds.push(v.id);
  }

  // Emit in LesPAC list order so the lot is stable cycle to cycle. A candidate
  // the budget clipped falls back to `reusable`: dropping it would make
  // runCatalogSync mark a perfectly live truck as SOLD. Its detail_fetched_at
  // stays put, so it is first in line next cycle.
  const vehicles: CatalogVehicle[] = [];
  for (const s of online) {
    const v = fresh.get(s.listingId) ?? reusable.get(s.listingId);
    if (v) vehicles.push(v);
  }

  // ...except when there was nothing to fall back on: a row we HOLD whose stored
  // payload is unusable (truncated, hand-edited) has no shippable version, so if
  // the budget clips it, it is simply missing from the lot. Missing is what
  // runCatalogSync reads as "sold", and it would flip a truck that LesPAC just
  // told us is ONLINE. Naming it here keeps it out of the sweep; it is still not
  // shipped, because shipping a broken payload to a public feed is worse.
  // A listing whose detail we DID attempt and that 404'd is deliberately absent:
  // that is a real deactivation and the sweep is right to mark it sold.
  const shipped = new Set(vehicles.map((v) => v.id));
  const retainIds = online
    .map((s) => String(s.listingId))
    .filter((id) => stored.has(id) && !shipped.has(id) && !attemptedIds.has(id));

  return { vehicles, detailFetches: refreshedIds.length, refreshedIds, retainIds };
}

/**
 * The ONLINE snapshot rows, keyed by id. A read failure is fatal: carrying on
 * with "no rows" would classify every listing as unknown and fire a full detail
 * sweep — the traffic spike this module exists to prevent.
 *
 * Filtered on `status = 'online'` on purpose. Sold rows are never deleted, and
 * only an online row can ever be reused, so an unfiltered select would drag
 * every payload the dealer has ever listed — description included — out of
 * Postgres 96 times a day, growing forever. The one behavioural consequence: a
 * listing that went sold and came back ONLINE is treated as unknown and
 * re-fetched, rather than shipping a payload from before it was delisted.
 */
async function readSnapshot(supabase: SupabaseLike): Promise<Map<string, SnapshotRow>> {
  const { data, error } = await supabase
    .from("catalog_vehicle")
    .select("id, payload, detail_fetched_at")
    .eq("status", "online");

  if (error) throw new Error(`snapshot read failed: ${error.message}`);

  const out = new Map<string, SnapshotRow>();
  for (const row of (data ?? []) as SnapshotRow[]) out.set(row.id, row);
  return out;
}
