import { describe, it, expect } from "vitest";
import { botSettingsSchema } from "@/lib/bot/settings-schema";

describe("botSettingsSchema", () => {
  const valid = {
    enabledPlatforms: ["facebook"],
    syncIntervalSec: 3600,
    operatorEmail: "ops@example.com",
    maxJobsPerCycle: 8,
    paceMinMs: 4000,
    paceMaxMs: 12000,
  };

  it("accepts a valid payload", () => {
    expect(botSettingsSchema.safeParse(valid).success).toBe(true);
  });
  it("accepts an empty operator email", () => {
    expect(botSettingsSchema.safeParse({ ...valid, operatorEmail: "" }).success).toBe(true);
  });
  it("rejects an invalid email", () => {
    expect(botSettingsSchema.safeParse({ ...valid, operatorEmail: "nope" }).success).toBe(false);
  });
  it("rejects zero enabled platforms", () => {
    expect(botSettingsSchema.safeParse({ ...valid, enabledPlatforms: [] }).success).toBe(false);
  });
  it("rejects pace_max < pace_min", () => {
    expect(botSettingsSchema.safeParse({ ...valid, paceMinMs: 9000, paceMaxMs: 1000 }).success).toBe(false);
  });
  it("rejects an out-of-range cap", () => {
    expect(botSettingsSchema.safeParse({ ...valid, maxJobsPerCycle: 0 }).success).toBe(false);
  });
  it("rejects an unknown platform", () => {
    expect(botSettingsSchema.safeParse({ ...valid, enabledPlatforms: ["myspace"] }).success).toBe(false);
  });
});
