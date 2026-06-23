import path from "node:path";
import type { Platform } from "@/lib/bot/types";

export const ALL_PLATFORMS = ["facebook", "kijiji", "autotrader"] as const;
export const MAX_ATTEMPTS = 3;

const REPO_ROOT = process.cwd();

export interface BotConfig {
  enabledPlatforms: Platform[];
  syncIntervalSec: number;
  maxJobsPerCycle: number;
  maxAttempts: number;
  operatorEmail: string;
  sessionsDir: string;
  screenshotsDir: string;
  paceMinMs: number;
  paceMaxMs: number;
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadBotConfig(env?: Record<string, string | undefined>): BotConfig {
  const processEnv = env ?? process.env;
  const known = new Set<string>(ALL_PLATFORMS);
  const raw = (processEnv.BOT_PLATFORMS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => known.has(s)) as Platform[];
  const enabledPlatforms = raw.length > 0 ? raw : [...ALL_PLATFORMS];

  const sessionsDir = processEnv.BOT_SESSIONS_DIR ?? path.join(REPO_ROOT, "sessions");
  return {
    enabledPlatforms,
    syncIntervalSec: num(processEnv.SYNC_INTERVAL, 3600),
    maxJobsPerCycle: num(processEnv.MAX_JOBS_PER_CYCLE, 10),
    maxAttempts: num(processEnv.MAX_ATTEMPTS, MAX_ATTEMPTS),
    operatorEmail: processEnv.OPERATOR_EMAIL ?? "",
    sessionsDir,
    screenshotsDir: processEnv.BOT_SCREENSHOTS_DIR ?? path.join(sessionsDir, "screenshots"),
    paceMinMs: num(processEnv.BOT_PACE_MIN_MS, 4000),
    paceMaxMs: num(processEnv.BOT_PACE_MAX_MS, 12000),
  };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Env defaults overlaid with the live `bot_setting` row (DB wins where set).
 * The worker and dashboard call this so config edits apply without a restart.
 */
export async function getBotConfig(
  supabase: SupabaseClient<Database>,
): Promise<BotConfig> {
  const base = loadBotConfig();
  const { data } = await supabase
    .from("bot_setting")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (!data) return base;
  const known = new Set<string>(ALL_PLATFORMS);
  const platforms = (data.enabled_platforms ?? []).filter((p): p is Platform =>
    known.has(p),
  );
  return {
    ...base,
    enabledPlatforms: platforms.length > 0 ? platforms : base.enabledPlatforms,
    syncIntervalSec: data.sync_interval_sec ?? base.syncIntervalSec,
    maxJobsPerCycle: data.max_jobs_per_cycle ?? base.maxJobsPerCycle,
    operatorEmail: data.operator_email ?? base.operatorEmail,
    paceMinMs: data.pace_min_ms ?? base.paceMinMs,
    paceMaxMs: data.pace_max_ms ?? base.paceMaxMs,
  };
}
