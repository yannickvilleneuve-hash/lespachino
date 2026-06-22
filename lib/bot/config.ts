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
  };
}
