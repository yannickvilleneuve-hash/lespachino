import { describe, it, expect } from "vitest";
import {
  validatePublication,
  validatePublicationForChannels,
} from "@/lib/listings/publication";

describe("validatePublication", () => {
  const valid = {
    price_cad: 25000,
    description_fr: "Camion en bon état",
    photos: [{ is_hero: true }, { is_hero: false }],
  };

  it("passe quand tout est OK", () => {
    expect(validatePublication(valid)).toBeNull();
  });

  it("accepte prix absent pour les plateformes qui ne l'exigent pas", () => {
    expect(validatePublication({ ...valid, price_cad: 0 })).toBeNull();
    expect(validatePublication({ ...valid, price_cad: -1 })).toBeNull();
  });

  it("refuse prix absent quand Meta ou Google sont sélectionnés", () => {
    expect(validatePublicationForChannels({ ...valid, price_cad: 0 }, ["fb_marketplace"])).toBe(
      "price_missing",
    );
    expect(validatePublicationForChannels({ ...valid, price_cad: 0 }, ["google_vla"])).toBe(
      "price_missing",
    );
    expect(validatePublicationForChannels({ ...valid, price_cad: 0 }, ["native"])).toBeNull();
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

  it("refuse véhicule non disponible à la vente", () => {
    expect(validatePublication({ ...valid, available: false })).toBe("not_available");
  });
});
