/**
 * lib/bot/cycle.ts
 *
 * Orchestrates one full sync cycle for the LesPAC mirror bot.
 * Sequential per platform — never parallel — because each platform owns one
 * browser session and pacing must not interleave.
 *
 * Deviations from brief noted where applicable:
 * 1. `recordResult` real signature is recordResult(supabase, job, outcome) —
 *    3 args — not the flat object the brief listed.
 * 2. Errors live in lib/bot/types.ts, not a separate lib/bot/errors.ts.
 * 3. `pace()` also exists in harness.ts; we re-export our own from cycle.ts
 *    (the brief asks for it here, and harness uses env vars for its version).
 *    The cycle uses harness.pace() to respect env-var overrides in tests.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBotConfig } from "@/lib/bot/config";
import type { Job, MirrorListing, NormalizedListing, Platform } from "@/lib/bot/types";
import { SessionExpiredError, FatalError } from "@/lib/bot/types";
import { fetchActiveListings } from "@/lib/bot/lespac-reader";
import { computeContentHash } from "@/lib/bot/hash";
import { refreshSnapshot } from "@/lib/bot/snapshot";
import { loadPublications, recordResult } from "@/lib/bot/mirror-state";
import type { PublicationRow } from "@/lib/bot/mirror-state";
import { buildJobs } from "@/lib/bot/reconciler";
import { runWithSession, pace } from "@/lib/bot/harness";
import { DRIVERS } from "@/lib/bot/drivers";
import { alertOperator } from "@/lib/bot/alerter";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CycleSummary {
  listings: number;
  jobs: number;
  succeeded: number;
  failed: number;
  sessionsDead: Platform[];
}

// Re-export pace so it is available as a testing seam from this module.
// The underlying implementation honours BOT_PACE_MIN_MS / BOT_PACE_MAX_MS env
// vars so tests can set them to near-zero.
export { pace };

// ---------------------------------------------------------------------------
// Sentinel: break out of a platform's job loop without stopping other platforms
// ---------------------------------------------------------------------------
class StopPlatform extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StopPlatform";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalize(listing: NormalizedListing): MirrorListing {
  return "contentHash" in listing && typeof listing.contentHash === "string"
    ? (listing as MirrorListing)
    : { ...listing, contentHash: computeContentHash(listing) };
}

async function handleSessionDeath(
  supabase: SupabaseClient,
  platform: Platform,
  summary: CycleSummary,
): Promise<void> {
  if (summary.sessionsDead.includes(platform)) return;
  summary.sessionsDead.push(platform);

  // Mark the platform session as dead in DB so the dashboard can surface it.
  await supabase
    .from("platform_session")
    .upsert(
      { platform, health: "dead", last_validated_at: new Date().toISOString() },
      { onConflict: "platform" },
    );

  await alertOperator(
    supabase,
    `session-dead:${platform}`,
    `Session ${platform} expirée — ré-authentification requise`,
    `Le bot ne peut plus publier sur ${platform}. Refaire le login local: pnpm bot:login ${platform}, puis ré-uploader sessions/${platform}.json.`,
  );
}

async function runJob(
  supabase: SupabaseClient,
  cfg: ReturnType<typeof loadBotConfig>,
  driver: (typeof DRIVERS)[Platform],
  ctx: unknown,
  job: Job,
  mirrorByKey: Map<string, PublicationRow>,
  summary: CycleSummary,
): Promise<void> {
  const key = `${job.lespacId}:${job.platform}`;
  const prior = mirrorByKey.get(key);

  try {
    if (job.action === "create" && job.listing) {
      const { externalId, url } = await driver.publish(
        ctx as Parameters<typeof driver.publish>[0],
        job.listing,
      );
      await recordResult(supabase, job, {
        status: "live",
        externalId,
        externalUrl: url,
        publishedHash: job.listing.contentHash,
      });
    } else if (job.action === "update" && job.listing && job.externalId) {
      await driver.update(
        ctx as Parameters<typeof driver.update>[0],
        job.externalId,
        job.listing,
      );
      await recordResult(supabase, job, {
        status: "live",
        externalId: job.externalId,
        publishedHash: job.listing.contentHash,
      });
    } else if (job.action === "remove" && job.externalId) {
      await driver.remove(ctx as Parameters<typeof driver.remove>[0], job.externalId);
      await recordResult(supabase, job, {
        status: "removed",
        externalId: job.externalId,
      });
    } else {
      // Malformed job — skip silently (defensive)
      return;
    }
    summary.succeeded++;
  } catch (err) {
    // Session expired → bubble a sentinel so the platform loop stops, but the
    // cycle continues to the next platform.
    if (err instanceof SessionExpiredError) {
      throw new StopPlatform(err.message);
    }

    if (err instanceof FatalError) {
      await recordResult(supabase, job, {
        status: "failed",
        error: err.message,
      });
      const screenshot = (err as FatalError & { screenshotPath?: string }).screenshotPath;
      await alertOperator(
        supabase,
        `fatal:${job.platform}:${job.lespacId}`,
        `Échec fatal ${job.platform} — ${job.lespacId}`,
        `Le pilote ${job.platform} a échoué (page modifiée?). Capture: ${screenshot ?? "n/a"}`,
      );
      summary.failed++;
      return;
    }

    // Transient or unexpected error → retry accounting.
    // attempt_count is incremented in recordResult; this prior+1 mirrors the value recordResult will store, keeping the exhaustion decision consistent.
    const nextAttempt = (prior?.attemptCount ?? 0) + 1;
    const exhausted = nextAttempt >= cfg.maxAttempts;
    await recordResult(supabase, job, {
      status: exhausted ? "failed" : "pending",
      error: err instanceof Error ? err.message : String(err),
    });
    if (exhausted) {
      await alertOperator(
        supabase,
        `failed:${job.platform}:${job.lespacId}`,
        `Annonce ${job.lespacId} abandonnée sur ${job.platform}`,
        `Après ${cfg.maxAttempts} tentatives, le bot abandonne ${job.lespacId} sur ${job.platform}.`,
      );
      summary.failed++;
    }
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runCycle(): Promise<CycleSummary> {
  const supabase = createAdminClient();
  const cfg = loadBotConfig();

  // Step 1: Pull active LesPAC listings and ensure they have a content hash.
  const rawListings = await fetchActiveListings();
  const listings = rawListings.map((l) => normalize(l));
  const listingsMap = new Map<string, MirrorListing>(
    listings.map((l) => [l.lespacId, l]),
  );

  // Steps 2–4: Refresh snapshot, load mirror state, build jobs.
  const snapshot = await refreshSnapshot(supabase, listings);
  const mirror = await loadPublications(supabase);
  const jobs = buildJobs(snapshot, mirror, listingsMap, cfg.enabledPlatforms);

  const summary: CycleSummary = {
    listings: listings.length,
    jobs: jobs.length,
    succeeded: 0,
    failed: 0,
    sessionsDead: [],
  };

  // Index mirror by "lespacId:platform" for O(1) prior-attempt lookup.
  const mirrorByKey = new Map(mirror.map((m) => [`${m.lespacId}:${m.platform}`, m]));

  // Group jobs by platform.
  const byPlatform = new Map<Platform, Job[]>();
  for (const j of jobs) {
    const list = byPlatform.get(j.platform) ?? [];
    list.push(j);
    byPlatform.set(j.platform, list);
  }

  // Step 6: Execute each platform sequentially — ONE session per platform.
  for (const platform of cfg.enabledPlatforms) {
    const queued = (byPlatform.get(platform) ?? []).slice(0, cfg.maxJobsPerCycle);
    if (queued.length === 0) continue;

    const driver = DRIVERS[platform];

    try {
      await runWithSession(platform, async (ctx) => {
        for (let i = 0; i < queued.length; i++) {
          const job = queued[i];
          if (i > 0) await pace();
          await runJob(supabase, cfg, driver, ctx, job, mirrorByKey, summary);
        }
      });
    } catch (err) {
      if (err instanceof StopPlatform || err instanceof SessionExpiredError) {
        // Session expired — mark dead, alert, continue to next platform.
        await handleSessionDeath(supabase, platform, summary);
        continue;
      }
      // Unexpected harness error — rethrow (don't silently swallow cycle-level failures).
      throw err;
    }
  }

  return summary;
}
