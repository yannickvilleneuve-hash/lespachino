import { describe, it, expect } from "vitest";
import { siteVisible } from "@/lib/catalog/visibility";
import type { CatalogVehicle } from "@/lib/catalog/types";

function vehicle(over: Partial<CatalogVehicle> = {}): CatalogVehicle {
  return {
    id: "223612404",
    title: "Isuzu NRR 2022 avec Fourgon de 20 pieds",
    description: "Bon état",
    priceCad: 39733,
    year: 2022,
    make: "Isuzu",
    model: "NRR",
    km: 249000,
    isNew: false,
    isVehicle: true,
    bodyStyle: "TRUCK",
    exteriorColor: "Blanc",
    transmission: "AUTOMATIC",
    fuelType: "GASOLINE",
    photoUrls: ["https://cdn.lespac.com/a.jpg"],
    ...over,
  };
}

describe("siteVisible", () => {
  it("shows a truck with no price — 'prix à discuter' is still for sale", () => {
    expect(siteVisible(vehicle({ priceCad: null }))).toBe(true);
  });

  it("hides a listing with no photo — an empty card sells nothing", () => {
    expect(siteVisible(vehicle({ photoUrls: [] }))).toBe(false);
  });

  it("hides non-vehicles (bare cargo boxes, trailers)", () => {
    expect(siteVisible(vehicle({ isVehicle: false }))).toBe(false);
  });

  it("shows a complete listing", () => {
    expect(siteVisible(vehicle())).toBe(true);
  });
});
