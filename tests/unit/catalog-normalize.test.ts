import { describe, it, expect } from "vitest";
import {
  normalizeListing,
  parseKm,
  resolveMake,
  resolveModel,
  resolveYear,
  resolveBodyStyle,
  resolveTransmission,
  resolveFuelType,
  resolveColor,
  isVehicleCategory,
} from "@/lib/catalog/normalize";
import type { LespacListing, LespacContact } from "@/lib/lespac/types";

const contact: LespacContact = {
  type: "STANDARD",
  emailAddress: "alan@camion-hino.ca",
  firstName: "ALAN",
  lastName: "DUMAIS",
};

function listing(over: Partial<LespacListing> = {}): LespacListing {
  return {
    listingId: 223612404,
    vendorId: null,
    category: "Véhicules - Camions",
    title: "Isuzu NRR 2022 avec Fourgon de 20 pieds et Monte-Charge",
    description: "Bon état",
    price: 39733,
    postalCode: "G7H5B1",
    year: 2022,
    state: "USED",
    contact,
    status: "ONLINE",
    imageURLs: ["https://cdn.lespac.com/a.jpg"],
    attributes: {
      "Type de camion": "Camion léger",
      Marque: "Autre camion léger",
      "Modèle": "NRR",
      "Kilométrage": "249000",
      Transmission: "Automatique",
      "Couleur extérieure": "Blanc",
      "Type de carburant": "Sans plomb",
    },
    ...over,
  };
}

describe("parseKm", () => {
  it("strips spaces, commas, and the km suffix", () => {
    expect(parseKm("150 000 km")).toBe(150000);
    expect(parseKm("150,000")).toBe(150000);
    expect(parseKm("249000")).toBe(249000);
  });

  it("returns null when there are no digits", () => {
    expect(parseKm(null)).toBeNull();
    expect(parseKm("")).toBeNull();
    expect(parseKm("n/a")).toBeNull();
  });
});

describe("resolveMake", () => {
  // Real listings, 2026-07-10. The "Marque" attribute is hand-picked and wrong
  // often enough that the title has to win.
  it("rejects the 'Autre camion léger' taxonomy value and reads the title", () => {
    expect(
      resolveMake("Isuzu NRR 2022 avec Fourgon", "Autre camion léger"),
    ).toBe("Isuzu");
  });

  it("rejects 'Autre camion lourd' and title-cases a shouted make", () => {
    expect(resolveMake("2016 ISUZU NPR", "Autre camion lourd")).toBe("Isuzu");
  });

  it("rejects a Marque that contradicts the title (listing 195485399)", () => {
    expect(
      resolveMake("Isuzu NPR 2016 avec Fourgon de 22 pieds", "Hino"),
    ).toBe("Isuzu");
  });

  it("trusts Marque when it appears in the title, for its nicer casing", () => {
    expect(resolveMake("2020 FORD TRANSIT T-", "Ford")).toBe("Ford");
    expect(resolveMake("Hino 195 2020 avec Fourgon", "Hino")).toBe("Hino");
  });

  it("falls back to the first non-year token when Marque is absent", () => {
    expect(resolveMake("Jeep Wrangler", null)).toBe("Jeep");
    expect(resolveMake("Mercedes Sprinter 2025", null)).toBe("Mercedes");
  });

  it("strips punctuation and never throws on an empty title", () => {
    expect(resolveMake("Remorque , Trailer fermée", null)).toBe("Remorque");
    expect(resolveMake("", null)).toBe("");
  });
});

describe("resolveYear", () => {
  it("prefers the LesPAC year field", () => {
    expect(resolveYear(2022, "Isuzu NRR 2019")).toBe(2022);
  });

  it("falls back to a 4-digit token in the title", () => {
    expect(resolveYear(null, "2008 FORD F750 SUPER")).toBe(2008);
  });

  it("returns null when neither has a year (listing 221376020)", () => {
    expect(resolveYear(null, "Fourgon de 20 pieds avec Monte-charge")).toBeNull();
  });
});

describe("resolveModel", () => {
  it("prefers the Modèle attribute", () => {
    expect(resolveModel("Isuzu NRR 2022 avec Fourgon", "Isuzu", "NRR")).toBe("NRR");
  });

  it("falls back to the title minus year and make", () => {
    expect(resolveModel("Jeep Wrangler", "Jeep", null)).toBe("Wrangler");
    expect(resolveModel("Mercedes Sprinter 2025", "Mercedes", null)).toBe(
      "Sprinter",
    );
  });
});

describe("isVehicleCategory", () => {
  it("accepts the Véhicules branch", () => {
    expect(isVehicleCategory("Véhicules - Camions")).toBe(true);
    expect(isVehicleCategory("Véhicules - Utilitaires sport")).toBe(true);
  });

  it("rejects accessories and trailers", () => {
    expect(isVehicleCategory("Pneus, pièces & équipements - Équipements")).toBe(
      false,
    );
    expect(isVehicleCategory("Pneus, pièces & équipements - Remorques")).toBe(
      false,
    );
  });

  it("rejects an empty category", () => {
    expect(isVehicleCategory("")).toBe(false);
  });
});

describe("resolveBodyStyle", () => {
  it("maps the observed categories", () => {
    expect(resolveBodyStyle("Véhicules - Camions")).toBe("TRUCK");
    expect(resolveBodyStyle("Véhicules - Utilitaires sport")).toBe("SUV");
    expect(resolveBodyStyle("Véhicules - Minifourgonnettes")).toBe("MINIVAN");
    expect(resolveBodyStyle("Pneus, pièces & équipements - Remorques")).toBe(
      "OTHER",
    );
  });
});

describe("resolveTransmission / resolveFuelType / resolveColor", () => {
  it("maps French transmission values", () => {
    expect(resolveTransmission("Automatique")).toBe("AUTOMATIC");
    expect(resolveTransmission("Manuelle")).toBe("MANUAL");
    expect(resolveTransmission(null)).toBeNull();
    expect(resolveTransmission("Séquentielle")).toBeNull();
  });

  it("maps 'Sans plomb' to GASOLINE, not to null", () => {
    expect(resolveFuelType("Sans plomb")).toBe("GASOLINE");
    expect(resolveFuelType("Diesel")).toBe("DIESEL");
    expect(resolveFuelType(null)).toBeNull();
  });

  it("normalizes a shouted colour", () => {
    expect(resolveColor("BLANC")).toBe("Blanc");
    expect(resolveColor("Blanc")).toBe("Blanc");
    expect(resolveColor(null)).toBeNull();
  });
});

describe("normalizeListing", () => {
  it("anchors on listingId, never on the mostly-null vendorId", () => {
    expect(normalizeListing(listing()).id).toBe("223612404");
    expect(normalizeListing(listing({ vendorId: "F0063U" })).id).toBe(
      "223612404",
    );
  });

  it("reads the real make from the title despite a bogus Marque", () => {
    expect(normalizeListing(listing()).make).toBe("Isuzu");
  });

  it("reads attributes through accent-folded keys", () => {
    const v = normalizeListing(
      listing({ attributes: { marque: "Hino", kilometrage: "88 000" } }),
    );
    expect(v.km).toBe(88000);
  });

  it("carries the optional Meta fields", () => {
    const v = normalizeListing(listing());
    expect(v.exteriorColor).toBe("Blanc");
    expect(v.transmission).toBe("AUTOMATIC");
    expect(v.fuelType).toBe("GASOLINE");
    expect(v.bodyStyle).toBe("TRUCK");
  });

  it("flags a cargo box as not a vehicle (listing 221376020)", () => {
    const v = normalizeListing(
      listing({
        listingId: 221376020,
        category: "Pneus, pièces & équipements - Équipements",
        title: "Fourgon de 20 pieds avec Monte-charge",
        year: null,
        attributes: undefined,
      }),
    );
    expect(v.isVehicle).toBe(false);
    expect(v.year).toBeNull();
  });

  it("maps state NEW to isNew", () => {
    expect(normalizeListing(listing({ state: "NEW" })).isNew).toBe(true);
    expect(normalizeListing(listing({ state: "N/A" })).isNew).toBe(false);
  });

  it("treats a missing price as null, not zero", () => {
    expect(normalizeListing(listing({ price: null })).priceCad).toBeNull();
  });

  it("never throws on a listing with no attributes, photos, or description", () => {
    const v = normalizeListing(
      listing({ attributes: undefined, imageURLs: undefined, description: null }),
    );
    expect(v.photoUrls).toEqual([]);
    expect(v.description).toBe("");
    expect(v.km).toBeNull();
    expect(v.transmission).toBeNull();
  });
});
