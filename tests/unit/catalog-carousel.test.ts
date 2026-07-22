import { describe, it, expect } from "vitest";
import { CAROUSEL_LIMIT, pickCarouselVehicles } from "@/lib/catalog/carousel";
import type { SnapshotVehicle } from "@/lib/catalog/read";
import type { CatalogVehicle } from "@/lib/catalog/types";

function row(id: string, year: number): SnapshotVehicle {
  const vehicle: CatalogVehicle = {
    id,
    title: `Camion ${id}`,
    description: "",
    priceCad: 1000,
    year,
    make: "Hino",
    model: "L7",
    km: 1000,
    isNew: false,
    isVehicle: true,
    bodyStyle: "TRUCK",
    exteriorColor: null,
    transmission: null,
    fuelType: null,
    photoUrls: ["https://cdn.lespac.com/a.jpg"],
  };
  return { vehicle, status: "online", photos: [] };
}

const many = Array.from({ length: 21 }, (_, i) => row(String(i), 2020));

describe("pickCarouselVehicles", () => {
  it("keeps at most the limit — the strip is a teaser, not the inventory page", () => {
    expect(pickCarouselVehicles(many)).toHaveLength(CAROUSEL_LIMIT);
  });

  it("preserves the order it was given (callers sort, we slice)", () => {
    const picked = pickCarouselVehicles(many, 3);
    expect(picked.map((r) => r.vehicle.id)).toEqual(["0", "1", "2"]);
  });

  it("returns a shorter list untouched", () => {
    const three = many.slice(0, 3);
    expect(pickCarouselVehicles(three)).toHaveLength(3);
  });

  it("returns nothing for an empty inventory", () => {
    expect(pickCarouselVehicles([])).toEqual([]);
  });

  it("treats a zero or negative limit as empty, never as slice-from-the-end", () => {
    // `slice(0, -1)` would silently drop the LAST vehicle and show 20 of them.
    expect(pickCarouselVehicles(many, 0)).toEqual([]);
    expect(pickCarouselVehicles(many, -1)).toEqual([]);
  });

  it("does not hand back the caller's array", () => {
    const three = many.slice(0, 3);
    expect(pickCarouselVehicles(three)).not.toBe(three);
  });
});
