process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";

import { describe, it, expect } from "vitest";
import {
  photoSrc,
  sortByYearDesc,
  toSnapshotVehicle,
  syncHealth,
  staleThresholdSec,
  formatAgeFr,
  STALE_CYCLES,
  type SyncRow,
} from "@/lib/catalog/read";
import { DEFAULT_SYNC_INTERVAL_SEC } from "@/lib/catalog/sync-config";
import type { CatalogVehicle } from "@/lib/catalog/types";

function vehicle(over: Partial<CatalogVehicle> = {}): CatalogVehicle {
  return {
    id: "1",
    title: "Isuzu NRR 2022",
    description: "",
    priceCad: 39733,
    year: 2022,
    make: "Isuzu",
    model: "NRR",
    km: 249000,
    isNew: false,
    isVehicle: true,
    bodyStyle: "TRUCK",
    exteriorColor: null,
    transmission: null,
    fuelType: null,
    photoUrls: ["https://cdn.lespac.com/a.jpg"],
    ...over,
  };
}

describe("photoSrc", () => {
  it("prefers our mirrored copy", () => {
    expect(
      photoSrc({ position: 0, sourceUrl: "https://cdn.lespac.com/a.jpg", storagePath: "catalog/1/0.jpg" }),
    ).toBe("https://proj.supabase.co/storage/v1/object/public/vehicle-photos/catalog/1/0.jpg");
  });

  it("falls back to the LesPAC CDN when the mirror failed", () => {
    expect(
      photoSrc({ position: 0, sourceUrl: "https://cdn.lespac.com/a.jpg", storagePath: null }),
    ).toBe("https://cdn.lespac.com/a.jpg");
  });
});

describe("sortByYearDesc", () => {
  it("puts the newest trucks first", () => {
    const rows = [
      { vehicle: vehicle({ id: "a", year: 2018 }), status: "online" as const, photos: [] },
      { vehicle: vehicle({ id: "b", year: 2024 }), status: "online" as const, photos: [] },
      { vehicle: vehicle({ id: "c", year: null }), status: "online" as const, photos: [] },
    ];
    expect(sortByYearDesc(rows).map((r) => r.vehicle.id)).toEqual(["b", "a", "c"]);
  });
});

describe("toSnapshotVehicle", () => {
  it("rebuilds the vehicle and its ordered photos from DB rows", () => {
    const row = {
      id: "1",
      payload: vehicle(),
      status: "online",
      photos: [
        { position: 1, source_url: "https://cdn.lespac.com/b.jpg", storage_path: null },
        { position: 0, source_url: "https://cdn.lespac.com/a.jpg", storage_path: "catalog/1/0.jpg" },
      ],
    };
    const snap = toSnapshotVehicle(row);

    expect(snap.status).toBe("online");
    expect(snap.vehicle.make).toBe("Isuzu");
    expect(snap.photos.map((p) => p.position)).toEqual([0, 1]);
  });
});

describe("syncHealth", () => {
  const NOW = new Date("2026-07-21T12:00:00.000Z");
  const THRESHOLD = 2700; // 3 × 900 s

  function row(over: Partial<SyncRow> = {}): SyncRow {
    return { ran_at: NOW.toISOString(), ok: true, count: 24, error: null, ...over };
  }

  function ranSecAgo(sec: number): string {
    return new Date(NOW.getTime() - sec * 1000).toISOString();
  }

  it("is fresh right after a successful cycle", () => {
    const s = syncHealth(row({ ran_at: ranSecAgo(240) }), NOW, THRESHOLD);
    expect(s.health).toBe("fresh");
    expect(s.ageSec).toBe(240);
    expect(s.count).toBe(24);
    expect(s.error).toBeNull();
  });

  it("is still fresh exactly at the threshold — stale means older than", () => {
    const s = syncHealth(row({ ran_at: ranSecAgo(THRESHOLD) }), NOW, THRESHOLD);
    expect(s.health).toBe("fresh");
    expect(s.ageSec).toBe(THRESHOLD);

    // One second past is the tipping point.
    expect(syncHealth(row({ ran_at: ranSecAgo(THRESHOLD + 1) }), NOW, THRESHOLD).health).toBe("stale");
  });

  it("is stale well past the threshold — the red path a dead worker takes", () => {
    const s = syncHealth(row({ ran_at: ranSecAgo(6 * 3600) }), NOW, THRESHOLD);
    expect(s.health).toBe("stale");
    expect(s.ageSec).toBe(21600);
    // Nothing crashed, nothing threw: the tile just turns red.
    expect(s.count).toBe(24);
  });

  it("is failing when ok is false, even when it just ran, and keeps the error", () => {
    const s = syncHealth(
      row({ ran_at: ranSecAgo(10), ok: false, count: 0, error: "vehicle list: JWT expired" }),
      NOW,
      THRESHOLD,
    );
    expect(s.health).toBe("failing");
    expect(s.error).toBe("vehicle list: JWT expired");
    expect(s.ageSec).toBe(10);
  });

  it("reports unknown for a missing row instead of throwing", () => {
    for (const missing of [null, undefined]) {
      const s = syncHealth(missing, NOW, THRESHOLD);
      expect(s.health).toBe("unknown");
      expect(s.ageSec).toBeNull();
      expect(s.ranAt).toBeNull();
      expect(s.count).toBeNull();
    }
  });

  it("reports unknown for an unparseable ran_at", () => {
    expect(syncHealth(row({ ran_at: "pas une date" }), NOW, THRESHOLD).health).toBe("unknown");
  });

  it("clamps a future ran_at to zero rather than showing a negative age", () => {
    const s = syncHealth(row({ ran_at: new Date(NOW.getTime() + 90_000).toISOString() }), NOW, THRESHOLD);
    expect(s.ageSec).toBe(0);
    expect(s.health).toBe("fresh");
  });
});

describe("staleThresholdSec", () => {
  it("allows three missed-free cycles before alarming", () => {
    expect(staleThresholdSec(900)).toBe(2700);
    expect(staleThresholdSec()).toBe(DEFAULT_SYNC_INTERVAL_SEC * STALE_CYCLES);
  });
});

describe("formatAgeFr", () => {
  it("speaks French at every scale", () => {
    expect(formatAgeFr(30)).toBe("il y a 30 secondes");
    expect(formatAgeFr(240)).toBe("il y a 4 minutes");
    expect(formatAgeFr(7200)).toBe("il y a 2 heures");
    expect(formatAgeFr(172800)).toBe("avant-hier");
    expect(formatAgeFr(null)).toBe("date inconnue");
  });
});
