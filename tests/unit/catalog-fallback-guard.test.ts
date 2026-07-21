import { describe, it, expect, vi } from "vitest";
import { createFallbackGuard } from "@/lib/catalog/fallback-guard";

describe("createFallbackGuard", () => {
  it("allows calls up to the budget, then refuses within the same window", () => {
    const g = createFallbackGuard({ maxPerWindow: 3, windowMs: 60_000 });

    expect(g.allow("1", 0)).toBe(true);
    expect(g.allow("2", 10)).toBe(true);
    expect(g.allow("3", 20)).toBe(true);
    // The 4th distinct id in the same minute is the amplification we refuse.
    expect(g.allow("4", 30)).toBe(false);
    expect(g.allow("5", 59_999)).toBe(false);
  });

  it("refills on the next window", () => {
    const g = createFallbackGuard({ maxPerWindow: 1, windowMs: 60_000 });

    expect(g.allow("1", 0)).toBe(true);
    expect(g.allow("2", 30_000)).toBe(false);
    expect(g.allow("3", 60_000)).toBe(true);
  });

  it("reports saturation once per window, not once per blocked request", () => {
    const onSaturated = vi.fn();
    const g = createFallbackGuard({ maxPerWindow: 1, windowMs: 1000, onSaturated });

    g.allow("1", 0);
    g.allow("2", 10);
    g.allow("3", 20);
    g.allow("4", 30);
    expect(onSaturated).toHaveBeenCalledTimes(1);

    g.allow("5", 1000); // new window, budget refilled
    g.allow("6", 1010); // saturates again
    expect(onSaturated).toHaveBeenCalledTimes(2);
  });

  it("remembers an id LesPAC did not know, so a repeat costs nothing", () => {
    const g = createFallbackGuard({ maxPerWindow: 10, missTtlMs: 300_000 });

    expect(g.allow("999", 0)).toBe(true);
    g.recordMiss("999", 0);
    expect(g.allow("999", 1000)).toBe(false);
    expect(g.allow("999", 299_999)).toBe(false);
  });

  it("forgets a miss once its memory expires", () => {
    const g = createFallbackGuard({ maxPerWindow: 10, missTtlMs: 1000 });

    g.recordMiss("999", 0);
    expect(g.allow("999", 500)).toBe(false);
    // The truck may genuinely have been posted since: re-check after the TTL.
    expect(g.allow("999", 1001)).toBe(true);
  });

  it("does not spend budget on an id it already knows is a miss", () => {
    const g = createFallbackGuard({ maxPerWindow: 3, missTtlMs: 300_000 });

    // The first attempt legitimately costs budget — we did not know yet.
    expect(g.allow("999", 0)).toBe(true);
    g.recordMiss("999", 0);

    // The 50 repeats are free: they never reach the budget check.
    for (let i = 0; i < 50; i += 1) expect(g.allow("999", 100 + i)).toBe(false);

    // So the remaining 2 of the 3 are still there for real ids.
    expect(g.allow("1", 200)).toBe(true);
    expect(g.allow("2", 201)).toBe(true);
    expect(g.allow("3", 202)).toBe(false);
  });

  it("keeps the miss memory bounded under a walk of the id space", () => {
    const g = createFallbackGuard({ maxPerWindow: 10_000, maxMisses: 10, missTtlMs: 300_000 });

    for (let i = 0; i < 100; i += 1) g.recordMiss(String(i), 0);

    // The oldest entries were dropped, so early ids are eligible again — that is
    // the trade: a bounded map, not a perfect memory.
    expect(g.allow("0", 1)).toBe(true);
    // The most recent misses are still remembered.
    expect(g.allow("99", 1)).toBe(false);
  });
});
