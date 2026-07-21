/** Default cadence of the snapshot refresh, in seconds. */
export const DEFAULT_SYNC_INTERVAL_SEC = 900;

/** Never poll LesPAC faster than this, whatever the environment says. */
export const MIN_SYNC_INTERVAL_SEC = 60;

/**
 * How often the worker refreshes the snapshot.
 *
 * `Number` rather than `parseInt` on purpose: `parseInt("15m")` returns 15, so a
 * plausible typo would silently poll LesPAC fifteen times more often than
 * intended, forever, announced only in a startup log line. `Number("15m")` is
 * NaN, which falls back to the default instead.
 *
 * The same token serves the live Meta feed, so over-polling it is not a local
 * problem: getting rate-limited would take the feed down with us.
 */
export function resolveIntervalSec(raw: string | undefined): number {
  const parsed = raw === undefined || raw.trim() === "" ? Number.NaN : Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_SYNC_INTERVAL_SEC;
  return Math.max(MIN_SYNC_INTERVAL_SEC, Math.floor(parsed));
}

/** How long a stored `payload` is considered current, in seconds. */
export const DEFAULT_DETAIL_TTL_SEC = 3600;

/**
 * A TTL shorter than this is pointless: the sync runs every 900 s, so anything
 * below one cycle means "re-fetch every listing, every cycle" — exactly the
 * traffic this whole mechanism exists to remove.
 */
export const MIN_DETAIL_TTL_SEC = 300;

/** Detail fetches allowed per cycle. */
export const DEFAULT_DETAIL_BUDGET = 8;

/**
 * Zero would freeze the catalog forever: nothing would ever be re-fetched, so a
 * price change on LesPAC would never reach the site or the Meta feed.
 */
export const MIN_DETAIL_BUDGET = 1;

/**
 * How long the incremental fetcher trusts a stored payload before re-fetching
 * the LesPAC detail for that listing.
 *
 * Same `Number`-not-`parseInt` treatment as `resolveIntervalSec`, for the same
 * reason: `parseInt("1h")` is 1, and a one-second TTL turns every cycle back
 * into a full 24-detail sweep of the token the live Meta feed shares.
 */
export function resolveDetailTtlSec(raw: string | undefined): number {
  const parsed = raw === undefined || raw.trim() === "" ? Number.NaN : Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_DETAIL_TTL_SEC;
  return Math.max(MIN_DETAIL_TTL_SEC, Math.floor(parsed));
}

/**
 * Hard ceiling on detail fetches per cycle.
 *
 * The TTL alone does not bound traffic: every listing refreshed in the same
 * cycle expires in the same cycle an hour later, so the load self-synchronizes
 * into one spike. The budget spreads it back out — the overflow simply waits
 * for the next cycle, reusing its stored payload meanwhile.
 */
export function resolveDetailBudget(raw: string | undefined): number {
  const parsed = raw === undefined || raw.trim() === "" ? Number.NaN : Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_DETAIL_BUDGET;
  return Math.max(MIN_DETAIL_BUDGET, Math.floor(parsed));
}
