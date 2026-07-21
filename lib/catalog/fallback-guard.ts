/**
 * Bounds the live-LesPAC fallback behind /vehicule/<id>.
 *
 * The fallback exists so a URL the Meta feed advertises never 404s while the
 * snapshot catches up. But the page is public and the id space is numeric, so
 * without a bound, anyone walking /vehicule/1, /vehicule/2, ... turns our own
 * page into an amplifier against `LESPAC_API_TOKEN` — the token the live Meta
 * feed depends on. Getting that token throttled would take the feed down, which
 * is the exact failure the incremental fetcher was built to avoid.
 *
 * Two bounds, both per process:
 *  - a fixed window of live calls, so enumeration costs a known maximum;
 *  - a short memory of ids LesPAC did not know, so a repeat costs nothing.
 *
 * Being per process is enough: it is the LesPAC token we are protecting, and a
 * single Next server holds it.
 */

export interface FallbackGuardOptions {
  /** Live LesPAC calls allowed per window. */
  maxPerWindow?: number;
  windowMs?: number;
  /** How long an id LesPAC did not know stays remembered. */
  missTtlMs?: number;
  /** Cap on remembered misses, so a walk cannot grow the map without end. */
  maxMisses?: number;
  /** Called once per window when the budget runs out. */
  onSaturated?: (windowStartMs: number) => void;
}

export interface FallbackGuard {
  /** True when a live call for this id may proceed; consumes budget. */
  allow(id: string, nowMs: number): boolean;
  /** Remember that LesPAC returned nothing for this id. */
  recordMiss(id: string, nowMs: number): void;
}

export const DEFAULT_MAX_PER_WINDOW = 10;
export const DEFAULT_WINDOW_MS = 60_000;
export const DEFAULT_MISS_TTL_MS = 300_000;
export const DEFAULT_MAX_MISSES = 500;

export function createFallbackGuard(options: FallbackGuardOptions = {}): FallbackGuard {
  const maxPerWindow = options.maxPerWindow ?? DEFAULT_MAX_PER_WINDOW;
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const missTtlMs = options.missTtlMs ?? DEFAULT_MISS_TTL_MS;
  const maxMisses = options.maxMisses ?? DEFAULT_MAX_MISSES;
  const onSaturated = options.onSaturated;

  /** id → moment the memory of this miss expires. Insertion-ordered. */
  const misses = new Map<string, number>();
  let windowStart = Number.NEGATIVE_INFINITY;
  let used = 0;
  let saturationReported = false;

  return {
    allow(id: string, nowMs: number): boolean {
      const missUntil = misses.get(id);
      if (missUntil !== undefined) {
        if (missUntil > nowMs) return false;
        misses.delete(id);
      }

      if (nowMs - windowStart >= windowMs) {
        windowStart = nowMs;
        used = 0;
        saturationReported = false;
      }

      if (used >= maxPerWindow) {
        // One line per window, not one per blocked request: under a walk that
        // would be thousands of lines saying the same thing.
        if (!saturationReported) {
          saturationReported = true;
          onSaturated?.(windowStart);
        }
        return false;
      }

      used += 1;
      return true;
    },

    recordMiss(id: string, nowMs: number): void {
      misses.set(id, nowMs + missTtlMs);
      // Oldest insertion first — enough to keep the map bounded without
      // pretending to be an LRU.
      while (misses.size > maxMisses) {
        const oldest = misses.keys().next();
        if (oldest.done) break;
        misses.delete(oldest.value);
      }
    },
  };
}
