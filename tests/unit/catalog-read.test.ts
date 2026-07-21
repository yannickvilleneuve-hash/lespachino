process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";

import { describe, it, expect } from "vitest";
import { photoSrc, sortByYearDesc, toSnapshotVehicle } from "@/lib/catalog/read";
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
