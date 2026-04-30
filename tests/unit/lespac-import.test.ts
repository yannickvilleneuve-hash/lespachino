import { describe, it, expect } from "vitest";
import { rankSertiMatches, isManual } from "@/lib/lespac/import";

describe("isManual", () => {
  it("vrai si vendorId null ou vide", () => {
    expect(
      isManual({ listingId: 1, vendorId: null as unknown as string, title: "", state: "USED", status: "ONLINE" }),
    ).toBe(true);
    expect(
      isManual({ listingId: 1, vendorId: "", title: "", state: "USED", status: "ONLINE" }),
    ).toBe(true);
    expect(
      isManual({ listingId: 1, vendorId: "U1", title: "", state: "USED", status: "ONLINE" }),
    ).toBe(false);
  });
});

describe("rankSertiMatches", () => {
  const candidates = [
    { unit: "U1", make: "HINO", model: "195", year: 2013, km: 209000 },
    { unit: "U2", make: "HINO", model: "195", year: 2013, km: 50000 },
    { unit: "U3", make: "ISUZU", model: "NPR", year: 2016, km: 100000 },
    { unit: "U4", make: "HINO", model: "L8", year: 2026, km: 0 },
  ];

  it("priorise marque + modèle + année + km", () => {
    const ranked = rankSertiMatches(
      {
        year: 2013,
        attributes: {
          Marque: "Hino",
          Modèle: "195",
          Kilométrage: "210000",
        },
      },
      candidates,
    );
    expect(ranked[0].unit).toBe("U1");
    expect(ranked[0].reasons).toContain("marque");
    expect(ranked[0].reasons).toContain("modèle");
    expect(ranked[0].reasons).toContain("année");
    expect(ranked[0].reasons).toContain("km ±10%");
  });

  it("normalise L8 / L 8 / l-8", () => {
    const ranked = rankSertiMatches(
      { year: 2026, attributes: { Marque: "Hino", Modèle: "L 8", Kilométrage: "0" } },
      candidates,
    );
    expect(ranked[0].unit).toBe("U4");
  });

  it("renvoie liste vide si rien ne match", () => {
    const ranked = rankSertiMatches(
      { year: 2010, attributes: { Marque: "Mercedes", Modèle: "Sprinter" } },
      candidates,
    );
    expect(ranked).toEqual([]);
  });

  it("départage par km quand make+model+year match plusieurs", () => {
    const cs = [
      { unit: "A", make: "HINO", model: "195", year: 2020, km: 100000 },
      { unit: "B", make: "HINO", model: "195", year: 2020, km: 35000 },
    ];
    const ranked = rankSertiMatches(
      { year: 2020, attributes: { Marque: "Hino", Modèle: "195", Kilométrage: "36000" } },
      cs,
    );
    expect(ranked[0].unit).toBe("B");
  });
});
