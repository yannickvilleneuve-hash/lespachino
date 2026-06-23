import { describe, it, expect, vi } from "vitest";
import { getBotConfig } from "@/lib/bot/config";

function supabaseWith(row: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }),
      }),
    }),
  } as never;
}

describe("getBotConfig", () => {
  it("falls back to env defaults when no row exists", async () => {
    const cfg = await getBotConfig(supabaseWith(null));
    expect(cfg.syncIntervalSec).toBe(3600);
    expect(cfg.enabledPlatforms.length).toBeGreaterThan(0);
  });

  it("overlays DB values over env defaults", async () => {
    const cfg = await getBotConfig(
      supabaseWith({
        enabled_platforms: ["facebook"],
        sync_interval_sec: 10800,
        operator_email: "db@example.com",
        max_jobs_per_cycle: 5,
        pace_min_ms: 8000,
        pace_max_ms: 20000,
      }),
    );
    expect(cfg.syncIntervalSec).toBe(10800);
    expect(cfg.operatorEmail).toBe("db@example.com");
    expect(cfg.maxJobsPerCycle).toBe(5);
    expect(cfg.enabledPlatforms).toEqual(["facebook"]);
    expect(cfg.paceMinMs).toBe(8000);
    expect(cfg.paceMaxMs).toBe(20000);
  });
});
