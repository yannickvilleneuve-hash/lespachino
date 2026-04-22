import { describe, it, expect } from "vitest";
import { validatePublication } from "@/lib/listings/publication";

describe("validatePublication", () => {
  const valid = {
    price_cad: 25000,
    description_fr: "Camion en bon état",
    photos: [{ is_hero: true }, { is_hero: false }],
  };

  it("passe quand tout est OK", () => {
    expect(validatePublication(valid)).toBeNull();
  });

  it("refuse prix <= 0", () => {
    expect(validatePublication({ ...valid, price_cad: 0 })).toBe("price_missing");
    expect(validatePublication({ ...valid, price_cad: -1 })).toBe("price_missing");
  });

  it("refuse description vide / blanche", () => {
    expect(validatePublication({ ...valid, description_fr: "" })).toBe("description_missing");
    expect(validatePublication({ ...valid, description_fr: "   " })).toBe("description_missing");
  });

  it("refuse zéro photo", () => {
    expect(validatePublication({ ...valid, photos: [] })).toBe("no_photos");
  });

  it("refuse photos sans hero", () => {
    expect(
      validatePublication({ ...valid, photos: [{ is_hero: false }, { is_hero: false }] }),
    ).toBe("no_hero");
  });
});
