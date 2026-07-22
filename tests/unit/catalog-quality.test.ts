import { describe, it, expect } from "vitest";
import { findTruncatedModels, truncationReason } from "@/lib/catalog/quality";
import type { SnapshotVehicle } from "@/lib/catalog/read";
import type { CatalogVehicle } from "@/lib/catalog/types";

function vehicle(over: Partial<CatalogVehicle> = {}): CatalogVehicle {
  return {
    id: "222034219",
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
    photoUrls: ["https://cdn.lespac.com/a.jpg"],
    ...over,
  };
}

const row = (v: CatalogVehicle): SnapshotVehicle => ({ vehicle: v, status: "online", photos: [] });

describe("truncationReason", () => {
  it("attrape un modèle coupé net sur un séparateur", () => {
    const v = vehicle({ title: "2024 FORD TRANSIT T-", model: "TRANSIT T-" });
    expect(truncationReason(v)).toMatch(/coup/i);
  });

  it("attrape la signature d'un champ à longueur fixe: titre 20, modèle 10", () => {
    // "F750 SUPER" ne pend sur rien, mais "F750 SUPER DUTY" a perdu son DUTY.
    const v = vehicle({ title: "2008 FORD F750 SUPER", model: "F750 SUPER" });
    expect(truncationReason(v)).toMatch(/longueur fixe/i);
  });

  it("laisse tranquille un modèle complet", () => {
    expect(truncationReason(vehicle())).toBeNull();
    expect(truncationReason(vehicle({ model: "Transit T-250" }))).toBeNull();
  });

  it("ne se déclenche pas sur un titre de 20 caractères au modèle normal", () => {
    // Deux indices valent mieux qu'un: la longueur seule condamnerait des titres
    // parfaitement écrits.
    const v = vehicle({ title: "Mercedes Sprinter 25", model: "Sprinter" });
    expect(truncationReason(v)).toBeNull();
  });

  it("ignore un modèle vide — c'est un autre problème, pas une troncature", () => {
    expect(truncationReason(vehicle({ model: "" }))).toBeNull();
  });

  it("ignore les espaces de fin avant de juger", () => {
    expect(truncationReason(vehicle({ model: "TRANSIT T-  " }))).toMatch(/coup/i);
  });
});

describe("findTruncatedModels", () => {
  it("ne retient que les suspects, avec de quoi retrouver l'annonce", () => {
    const suspects = findTruncatedModels([
      row(vehicle()),
      row(vehicle({ id: "222042231", title: "2024 FORD TRANSIT T-", model: "TRANSIT T-" })),
    ]);

    expect(suspects).toHaveLength(1);
    expect(suspects[0].id).toBe("222042231");
    expect(suspects[0].title).toBe("2024 FORD TRANSIT T-");
    expect(suspects[0].reason).toBeTruthy();
  });

  it("rend une liste vide quand tout est propre", () => {
    expect(findTruncatedModels([row(vehicle())])).toEqual([]);
  });
});
