import { describe, it, expect } from "vitest";
import { loadBotConfig, ALL_PLATFORMS } from "@/lib/bot/config";

describe("loadBotConfig", () => {
  it("parses enabled platforms from csv and ignores unknowns", () => {
    const cfg = loadBotConfig({ BOT_PLATFORMS: "facebook, kijiji, myspace" });
    expect(cfg.enabledPlatforms).toEqual(["facebook", "kijiji"]);
  });

  it("defaults to all platforms when BOT_PLATFORMS unset", () => {
    const cfg = loadBotConfig({});
    expect(cfg.enabledPlatforms).toEqual([...ALL_PLATFORMS]);
  });

  it("applies numeric defaults and overrides", () => {
    expect(loadBotConfig({}).syncIntervalSec).toBe(3600);
    expect(loadBotConfig({}).maxJobsPerCycle).toBe(10);
    expect(loadBotConfig({ SYNC_INTERVAL: "120", MAX_JOBS_PER_CYCLE: "2" }))
      .toMatchObject({ syncIntervalSec: 120, maxJobsPerCycle: 2 });
  });

  it("ignores non-numeric env and falls back to default", () => {
    expect(loadBotConfig({ SYNC_INTERVAL: "abc" }).syncIntervalSec).toBe(3600);
  });

  it("reads operator email", () => {
    expect(loadBotConfig({ OPERATOR_EMAIL: "ops@x.ca" }).operatorEmail).toBe("ops@x.ca");
  });
});
