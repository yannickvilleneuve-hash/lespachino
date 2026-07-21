import { describe, it, expect } from "vitest";
import {
  selectEligible,
  hasPlausibleOdometer,
  formatFeedPrice,
  feedTitle,
  xmlEscape,
} from "@/lib/feeds/eligibility";
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
    photoUrls: ["https://cdn.lespac.com/a.jpg", "https://cdn.lespac.com/b.jpg"],
    ...over,
  };
}

describe("formatFeedPrice", () => {
  it("emits a fixed-point amount with the currency code", () => {
    expect(formatFeedPrice(39733)).toBe("39733.00 CAD");
    expect(formatFeedPrice(39733.5)).toBe("39733.50 CAD");
  });
});

describe("feedTitle", () => {
  it("joins year, make, model", () => {
    expect(feedTitle(vehicle())).toBe("2022 Isuzu NRR");
  });

  it("skips empty parts rather than leaving double spaces", () => {
    expect(feedTitle(vehicle({ model: "" }))).toBe("2022 Isuzu");
  });
});

describe("xmlEscape", () => {
  it("escapes the five XML metacharacters", () => {
    expect(xmlEscape(`a & b < c > d " e ' f`)).toBe(
      "a &amp; b &lt; c &gt; d &quot; e &apos; f",
    );
  });
});

describe("hasPlausibleOdometer", () => {
  it("rejects a sub-100 km reading on a used vehicle", () => {
    expect(hasPlausibleOdometer(vehicle({ km: 10, isNew: false }))).toBe(false);
    expect(hasPlausibleOdometer(vehicle({ km: 0, isNew: false }))).toBe(false);
  });

  it("accepts a sub-100 km reading on a new vehicle", () => {
    expect(hasPlausibleOdometer(vehicle({ km: 0, isNew: true }))).toBe(true);
  });

  it("accepts a real odometer", () => {
    expect(hasPlausibleOdometer(vehicle({ km: 249000 }))).toBe(true);
  });

  it("treats a missing odometer as not plausible (nothing to emit)", () => {
    expect(hasPlausibleOdometer(vehicle({ km: null }))).toBe(false);
  });
});

describe("selectEligible", () => {
  it("keeps a complete vehicle", () => {
    const { eligible, skipped } = selectEligible([vehicle()]);
    expect(eligible).toHaveLength(1);
    expect(skipped).toEqual([]);
  });

  it("drops a cargo box before it can pose as a truck", () => {
    const { eligible, skipped } = selectEligible([
      vehicle({ id: "221376020", isVehicle: false }),
    ]);
    expect(eligible).toEqual([]);
    expect(skipped).toEqual([
      { id: "221376020", reason: "not a vehicle (accessory / trailer category)" },
    ]);
  });

  it("drops a 'prix à discuter' listing", () => {
    const { skipped } = selectEligible([
      vehicle({ id: "215367807", priceCad: null }),
    ]);
    expect(skipped).toEqual([
      { id: "215367807", reason: "no price (prix à discuter)" },
    ]);
  });

  it("drops photoless, makeless, and yearless listings", () => {
    expect(selectEligible([vehicle({ id: "a", photoUrls: [] })]).skipped).toEqual([
      { id: "a", reason: "no photo" },
    ]);
    expect(selectEligible([vehicle({ id: "b", make: "" })]).skipped).toEqual([
      { id: "b", reason: "no make" },
    ]);
    expect(selectEligible([vehicle({ id: "c", year: null })]).skipped).toEqual([
      { id: "c", reason: "no year" },
    ]);
  });

  it("publishes a truck with a placeholder odometer, but warns", () => {
    // Listing 222013230: a 2008 F750 with "Kilométrage: 10".
    const { eligible, skipped, warnings } = selectEligible([
      vehicle({ id: "222013230", year: 2008, km: 10 }),
    ]);
    expect(eligible.map((v) => v.id)).toEqual(["222013230"]);
    expect(skipped).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].warning).toContain("implausible odometer");
  });

  it("does not warn when the odometer is simply absent", () => {
    expect(selectEligible([vehicle({ km: null })]).warnings).toEqual([]);
  });

  it("reports one reason per rejected listing, not a total", () => {
    const { eligible, skipped } = selectEligible([
      vehicle({ id: "a" }),
      vehicle({ id: "b", isVehicle: false }),
      vehicle({ id: "c", priceCad: null }),
    ]);
    expect(eligible.map((v) => v.id)).toEqual(["a"]);
    expect(skipped.map((s) => s.id)).toEqual(["b", "c"]);
  });
});
