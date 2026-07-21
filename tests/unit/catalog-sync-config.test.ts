import { describe, it, expect } from "vitest";
import {
  resolveIntervalSec,
  DEFAULT_SYNC_INTERVAL_SEC,
  MIN_SYNC_INTERVAL_SEC,
} from "@/lib/catalog/sync-config";

describe("resolveIntervalSec", () => {
  it("uses the configured value", () => {
    expect(resolveIntervalSec("1800")).toBe(1800);
  });

  it("falls back to the default when unset or blank", () => {
    expect(resolveIntervalSec(undefined)).toBe(DEFAULT_SYNC_INTERVAL_SEC);
    expect(resolveIntervalSec("   ")).toBe(DEFAULT_SYNC_INTERVAL_SEC);
  });

  it("REJECTS a unit suffix instead of silently reading the number in front", () => {
    // parseInt("15m") is 15 — a typo that would poll LesPAC 15x more often than
    // intended, forever, on the token the live Meta feed shares.
    expect(resolveIntervalSec("15m")).toBe(DEFAULT_SYNC_INTERVAL_SEC);
    expect(resolveIntervalSec("30min")).toBe(DEFAULT_SYNC_INTERVAL_SEC);
    expect(resolveIntervalSec("abc")).toBe(DEFAULT_SYNC_INTERVAL_SEC);
  });

  it("never polls faster than the floor", () => {
    expect(resolveIntervalSec("1")).toBe(MIN_SYNC_INTERVAL_SEC);
    expect(resolveIntervalSec("0")).toBe(MIN_SYNC_INTERVAL_SEC);
    expect(resolveIntervalSec("-900")).toBe(MIN_SYNC_INTERVAL_SEC);
  });

  it("floors a fractional value rather than passing it to setTimeout", () => {
    expect(resolveIntervalSec("900.7")).toBe(900);
  });
});
