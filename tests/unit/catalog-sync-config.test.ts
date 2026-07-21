import { describe, it, expect } from "vitest";
import {
  resolveIntervalSec,
  resolveDetailTtlSec,
  resolveDetailBudget,
  DEFAULT_SYNC_INTERVAL_SEC,
  MIN_SYNC_INTERVAL_SEC,
  DEFAULT_DETAIL_TTL_SEC,
  MIN_DETAIL_TTL_SEC,
  DEFAULT_DETAIL_BUDGET,
  MIN_DETAIL_BUDGET,
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

describe("resolveDetailTtlSec", () => {
  it("uses the configured value", () => {
    expect(resolveDetailTtlSec("7200")).toBe(7200);
  });

  it("falls back to the default when unset, blank or non-numeric", () => {
    expect(resolveDetailTtlSec(undefined)).toBe(DEFAULT_DETAIL_TTL_SEC);
    expect(resolveDetailTtlSec("  ")).toBe(DEFAULT_DETAIL_TTL_SEC);
    // parseInt("1h") is 1 — a one-second TTL re-fetches all 24 details every
    // cycle, which is exactly the traffic this TTL exists to remove.
    expect(resolveDetailTtlSec("1h")).toBe(DEFAULT_DETAIL_TTL_SEC);
  });

  it("never trusts a TTL shorter than the floor", () => {
    expect(resolveDetailTtlSec("0")).toBe(MIN_DETAIL_TTL_SEC);
    expect(resolveDetailTtlSec("-1")).toBe(MIN_DETAIL_TTL_SEC);
  });

  it("floors a fractional value", () => {
    expect(resolveDetailTtlSec("3600.9")).toBe(3600);
  });
});

describe("resolveDetailBudget", () => {
  it("uses the configured value", () => {
    expect(resolveDetailBudget("16")).toBe(16);
  });

  it("falls back to the default when unset, blank or non-numeric", () => {
    expect(resolveDetailBudget(undefined)).toBe(DEFAULT_DETAIL_BUDGET);
    expect(resolveDetailBudget("")).toBe(DEFAULT_DETAIL_BUDGET);
    expect(resolveDetailBudget("8/cycle")).toBe(DEFAULT_DETAIL_BUDGET);
  });

  it("never drops to zero — that would freeze the catalog forever", () => {
    expect(resolveDetailBudget("0")).toBe(MIN_DETAIL_BUDGET);
    expect(resolveDetailBudget("-4")).toBe(MIN_DETAIL_BUDGET);
  });
});
