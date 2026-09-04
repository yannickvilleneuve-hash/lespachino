import { describe, it, expect } from "vitest";
import { displayPrice, displayTitle } from "@/app/vehicule/format";
import type { CatalogVehicle } from "@/lib/catalog/types";

function vehicle(over: Partial<CatalogVehicle> = {}): CatalogVehicle {
  return {
    id: "223612404",
    title: "Isuzu NRR 2022 avec Fourgon de 20 pieds",
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
    photoUrls: [],
    ...over,
  };
}

/** fr-CA groups with a narrow no-break space; comparing digits keeps it stable. */
const digits = (s: string) => s.replace(/\D/g, "");

describe("displayPrice", () => {
  it("says 'Prix à discuter' rather than $0 when there is no price", () => {
    expect(displayPrice(null)).toBe("Prix à discuter");
  });

  it("formats in Canadian dollars without cents", () => {
    const out = displayPrice(39733);
    expect(digits(out)).toBe("39733");
    expect(out).toContain("$");
  });

  it("shows a free truck as $0, not as 'Prix à discuter'", () => {
    // 0 is a price the dealer chose; null is the absence of one.
    expect(displayPrice(0)).not.toBe("Prix à discuter");
  });
});

describe("displayTitle", () => {
  it("copy-pastes the LesPAC listing title", () => {
    expect(displayTitle(vehicle())).toBe(
      "Isuzu NRR 2022 avec Fourgon de 20 pieds",
    );
  });

  it("ignores wrong year/make/model attrs when a LesPAC title exists", () => {
    expect(
      displayTitle(
        vehicle({
          title: "Hino L8 2026 avec Fourgon 26 pieds Isolé ( Frio )",
          year: 2024,
          make: "Hino",
          model: "L7",
        }),
      ),
    ).toBe("Hino L8 2026 avec Fourgon 26 pieds Isolé ( Frio )");
  });

  it("falls back to year + make + model only when the LesPAC title is empty", () => {
    expect(displayTitle(vehicle({ title: "" }))).toBe("2022 Isuzu NRR");
    expect(displayTitle(vehicle({ title: "   " }))).toBe("2022 Isuzu NRR");
  });
});
