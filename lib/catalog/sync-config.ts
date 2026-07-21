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
