process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";

import { describe, it, expect, vi } from "vitest";
import {
  photoSrc,
  sortByYearDesc,
  toSnapshotVehicle,
  liveAsSnapshotVehicle,
  resolveVehicleForPage,
  getSyncStatus,
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

describe("resolveVehicleForPage", () => {
  const snapshotHit = {
    vehicle: vehicle({ id: "42" }),
    status: "online" as const,
    photos: [{ position: 0, sourceUrl: "https://cdn.lespac.com/a.jpg", storagePath: "catalog/42/0.jpg" }],
  };

  it("returns the snapshot row unchanged and never touches LesPAC", async () => {
    const fromLive = vi.fn();
    const row = await resolveVehicleForPage("42", {
      fromSnapshot: async () => snapshotHit,
      fromLive,
    });

    expect(row).toBe(snapshotHit);
    // The whole point of the snapshot: one DB read, zero LesPAC calls.
    expect(fromLive).not.toHaveBeenCalled();
  });

  it("falls back to the live listing on a snapshot miss, in the same shape", async () => {
    const live = vehicle({
      id: "99",
      year: 2025,
      photoUrls: ["https://cdn.lespac.com/x.jpg", "https://cdn.lespac.com/y.jpg"],
    });
    const fromLive = vi.fn(async () => live);
    const onLiveHit = vi.fn();
    const row = await resolveVehicleForPage("99", {
      fromSnapshot: async () => null,
      fromLive,
      onLiveHit,
    });

    expect(fromLive).toHaveBeenCalledWith("99");
    // The operator gets one line saying the net caught a stale snapshot.
    expect(onLiveHit).toHaveBeenCalledWith("99");
    expect(row).not.toBeNull();
    // Same shape the page consumes on the snapshot path.
    expect(Object.keys(row!).sort()).toEqual(["photos", "status", "vehicle"]);
    expect(row!.vehicle).toBe(live);
    // A live listing is ONLINE by construction — never the "vendu" banner.
    expect(row!.status).toBe("online");
    expect(row!.photos).toEqual([
      { position: 0, sourceUrl: "https://cdn.lespac.com/x.jpg", storagePath: null },
      { position: 1, sourceUrl: "https://cdn.lespac.com/y.jpg", storagePath: null },
    ]);
  });

  it("gives the fallback's photos a src through photoSrc — the CDN, unmirrored", async () => {
    const row = await resolveVehicleForPage("99", {
      fromSnapshot: async () => null,
      fromLive: async () => vehicle({ id: "99", photoUrls: ["https://cdn.lespac.com/x.jpg"] }),
      onLiveHit: () => {},
    });

    // Nothing is mirrored yet for a truck the worker has never seen.
    expect(photoSrc(row!.photos[0])).toBe("https://cdn.lespac.com/x.jpg");
  });

  it("has no photos when the live listing has none, instead of throwing", async () => {
    const row = await resolveVehicleForPage("99", {
      fromSnapshot: async () => null,
      fromLive: async () => vehicle({ id: "99", photoUrls: [] }),
      onLiveHit: () => {},
    });
    expect(row!.photos).toEqual([]);
  });

  it("returns null when LesPAC does not know the id either — a real 404", async () => {
    const onLiveHit = vi.fn();
    expect(
      await resolveVehicleForPage("999999999", {
        fromSnapshot: async () => null,
        fromLive: async () => null,
        onLiveHit,
      }),
    ).toBeNull();
    // A bot probing junk ids must not write a line per request.
    expect(onLiveHit).not.toHaveBeenCalled();
  });

  it("returns null when the live call throws — an outage is a 404, never a 500", async () => {
    const onLiveError = vi.fn();
    const boom = new Error("Lespac GET /listings/99 → 503");

    const row = await resolveVehicleForPage("99", {
      fromSnapshot: async () => null,
      fromLive: async () => {
        throw boom;
      },
      onLiveError,
    });

    expect(row).toBeNull();
    expect(onLiveError).toHaveBeenCalledWith("99", boom);
  });
});

describe("liveAsSnapshotVehicle", () => {
  it("keeps photo order and marks nothing as mirrored", () => {
    const snap = liveAsSnapshotVehicle(
      vehicle({ photoUrls: ["https://cdn.lespac.com/0.jpg", "https://cdn.lespac.com/1.jpg"] }),
    );
    expect(snap.photos.map((p) => p.position)).toEqual([0, 1]);
    expect(snap.photos.every((p) => p.storagePath === null)).toBe(true);
    expect(snap.status).toBe("online");
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

describe("resolveVehicleForPage — bound on the live fallback", () => {
  const alwaysAllow = { allow: () => true, recordMiss: () => {} };

  it("does NOT call LesPAC when the guard refuses", async () => {
    const fromLive = vi.fn(async () => vehicle({ id: "99" }));
    const row = await resolveVehicleForPage("99", {
      fromSnapshot: async () => null,
      fromLive,
      guard: { allow: () => false, recordMiss: () => {} },
      nowMs: () => 0,
    });

    expect(row).toBeNull();
    // The whole point: a walk of the id space must not reach LesPAC.
    expect(fromLive).not.toHaveBeenCalled();
  });

  it("records a miss so the same unknown id costs nothing next time", async () => {
    const recordMiss = vi.fn();
    await resolveVehicleForPage("999999999", {
      fromSnapshot: async () => null,
      fromLive: async () => null,
      guard: { allow: () => true, recordMiss },
      nowMs: () => 4242,
    });

    expect(recordMiss).toHaveBeenCalledWith("999999999", 4242);
  });

  it("does not record a miss when the live call succeeds", async () => {
    const recordMiss = vi.fn();
    await resolveVehicleForPage("99", {
      fromSnapshot: async () => null,
      fromLive: async () => vehicle({ id: "99" }),
      onLiveHit: () => {},
      guard: { allow: () => true, recordMiss },
      nowMs: () => 0,
    });

    expect(recordMiss).not.toHaveBeenCalled();
  });

  it("never consults the guard when the snapshot already has the vehicle", async () => {
    const allow = vi.fn(() => true);
    await resolveVehicleForPage("42", {
      fromSnapshot: async () => ({
        vehicle: vehicle({ id: "42" }),
        status: "online" as const,
        photos: [],
      }),
      guard: { allow, recordMiss: () => {} },
    });

    expect(allow).not.toHaveBeenCalled();
  });

  it("still serves the fallback when the guard allows it", async () => {
    const row = await resolveVehicleForPage("99", {
      fromSnapshot: async () => null,
      fromLive: async () => vehicle({ id: "99" }),
      onLiveHit: () => {},
      guard: alwaysAllow,
      nowMs: () => 0,
    });

    expect(row?.vehicle.id).toBe("99");
  });
});

describe("getSyncStatus — never throws", () => {
  it("reports an unknown state instead of crashing the dashboard", async () => {
    // No service-role key: createAdminClient() throws on the very first line.
    // The dashboard must degrade to "état inconnu", never to a 500 — an
    // operator page that dies when the database is unreachable is the one page
    // you need most at that moment.
    const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const status = await getSyncStatus(new Date("2026-07-21T12:00:00.000Z"));
      expect(status.health).toBe("unknown");
      expect(status.ranAt).toBeNull();
      // Unknown is an absence of a verdict — it must never be painted green.
      expect(status.health).not.toBe("fresh");
    } finally {
      if (saved !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
    }
  });
});
