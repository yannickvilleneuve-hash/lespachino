import { describe, it, expect } from "vitest";
import { computeContentHash } from "@/lib/bot/hash";
import type { NormalizedListing } from "@/lib/bot/types";

const base = (overrides: Partial<NormalizedListing> = {}): NormalizedListing => ({
  lespacId: "12345",
  title: "2020 Hino 195",
  priceCad: 50000,
  description: "Bon camion",
  photoUrls: ["https://img/a.jpg", "https://img/b.jpg"],
  ...overrides,
});

describe("computeContentHash", () => {
  it("returns a 64-char sha256 hex string", () => {
    expect(computeContentHash(base())).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for identical content", () => {
    expect(computeContentHash(base())).toBe(computeContentHash(base()));
  });

  it("ignores lespacId (only published fields matter)", () => {
    expect(computeContentHash(base({ lespacId: "999" }))).toBe(
      computeContentHash(base()),
    );
  });

  it("changes when price changes", () => {
    expect(computeContentHash(base({ priceCad: 49000 }))).not.toBe(
      computeContentHash(base()),
    );
  });

  it("changes when title or description changes", () => {
    expect(computeContentHash(base({ title: "Other" }))).not.toBe(
      computeContentHash(base()),
    );
    expect(computeContentHash(base({ description: "Other" }))).not.toBe(
      computeContentHash(base()),
    );
  });

  it("is independent of photo order", () => {
    const a = computeContentHash(base({ photoUrls: ["x", "y", "z"] }));
    const b = computeContentHash(base({ photoUrls: ["z", "x", "y"] }));
    expect(a).toBe(b);
  });

  it("distinguishes a null price from a zero price", () => {
    expect(computeContentHash(base({ priceCad: null }))).not.toBe(
      computeContentHash(base({ priceCad: 0 })),
    );
  });
});
