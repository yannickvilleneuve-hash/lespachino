import { describe, it, expect } from "vitest";
import { buildCarouselJson } from "@/lib/catalog/carousel-json";
import type { SnapshotVehicle } from "@/lib/catalog/read";
import type { CatalogVehicle } from "@/lib/catalog/types";

function row(
  id: string,
  over: Partial<CatalogVehicle> = {},
  photos: SnapshotVehicle["photos"] = [],
): SnapshotVehicle {
  const vehicle: CatalogVehicle = {
    id,
    title: `Camion ${id}`,
    description: "",
    priceCad: 55800,
    year: 2024,
    make: "Hino",
    model: "L6",
    km: 1000,
    isNew: false,
    isVehicle: true,
    bodyStyle: "TRUCK",
    exteriorColor: null,
    transmission: null,
    fuelType: null,
    photoUrls: [],
    ...over,
  };
  return { vehicle, status: "online", photos };
}

const base = {
  origin: "https://feeds.hinochicoutimi.com",
  inventoryUrl: "https://camion-hino.ca/inventaire",
  now: new Date("2026-09-17T12:00:00Z"),
};

describe("buildCarouselJson", () => {
  it("pre-renders price and title so PHP prints strings verbatim", () => {
    const out = buildCarouselJson({ ...base, rows: [row("1")] });
    expect(out.items[0].title).toBe("Camion 1");
    expect(out.items[0].price.replace(/ /g, " ")).toBe("55 800 $");
    expect(out.items[0].priceCad).toBe(55800);
    expect(out.items[0].condition).toBe("Usagé");
  });

  it("says 'Prix à discuter' on a null price and keeps priceCad null", () => {
    const out = buildCarouselJson({ ...base, rows: [row("1", { priceCad: null })] });
    expect(out.items[0].price).toBe("Prix à discuter");
    expect(out.items[0].priceCad).toBeNull();
  });

  it("links to the vehicle page on the public origin, absolute", () => {
    const out = buildCarouselJson({ ...base, rows: [row("222241041")] });
    expect(out.items[0].url).toBe("https://feeds.hinochicoutimi.com/vehicule/222241041");
  });

  it("uses the mirrored hero when present, the CDN source otherwise, null with no photo", () => {
    const mirrored = row("1", {}, [
      { position: 0, sourceUrl: "https://cdn.lespac.com/a.jpg", storagePath: "catalog/1/0-abc.jpg" },
    ]);
    const cdnOnly = row("2", {}, [
      { position: 0, sourceUrl: "https://cdn.lespac.com/b.jpg", storagePath: null },
    ]);
    const out = buildCarouselJson({ ...base, rows: [mirrored, cdnOnly, row("3")] });
    expect(out.items[0].photo).toMatch(/\/vehicle-photos\/catalog\/1\/0-abc\.jpg$/);
    expect(out.items[1].photo).toBe("https://cdn.lespac.com/b.jpg");
    expect(out.items[2].photo).toBeNull();
  });

  it("flags new trucks and carries the inventory link and timestamp", () => {
    const out = buildCarouselJson({ ...base, rows: [row("1", { isNew: true })] });
    expect(out.items[0].condition).toBe("Neuf");
    expect(out.inventoryUrl).toBe("https://camion-hino.ca/inventaire");
    expect(out.generatedAt).toBe("2026-09-17T12:00:00.000Z");
  });
});
