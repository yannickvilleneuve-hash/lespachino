import { describe, it, expect } from "vitest";
import {
  detectChassis,
  suggestDescription,
} from "@/lib/listings/description-templates";

describe("detectChassis", () => {
  it("classe 5 pour 195 et NRR", () => {
    expect(detectChassis("HINO", "195").klass).toBe(5);
    expect(detectChassis("ISUZU", "NRR").klass).toBe(5);
  });

  it("classe 7 pour 338 / 358 / L7", () => {
    expect(detectChassis("HINO", "338").klass).toBe(7);
    expect(detectChassis("HINO", "358").klass).toBe(7);
    expect(detectChassis("HINO", "L7").klass).toBe(7);
  });

  it("transmission Allison RDS pour 358 (towing)", () => {
    expect(detectChassis("HINO", "358").trans).toContain("Allison 3000 RDS");
  });

  it("fallback classe 5 si modèle inconnu", () => {
    expect(detectChassis("HINO", "XYZ").klass).toBe(5);
  });
});

describe("suggestDescription", () => {
  const baseV = { year: 2019, make: "HINO", model: "195", km: 59000 };

  it("inclut titre + features class 5 quand body=none", () => {
    const out = suggestDescription(baseV, { body_type: "none" });
    expect(out).toContain("2019 HINO 195");
    expect(out).toContain("• Frein d'échappement");
    expect(out).toContain("• Air conditionné");
    expect(out).toMatch(/• Seulement 59\s000 km/);
    expect(out).not.toContain("Frein moteur");
    expect(out).not.toContain("Roues en aluminium Alcoa");
  });

  it("classe 7 ajoute frein moteur + air + Alcoa", () => {
    const out = suggestDescription(
      { year: 2017, make: "HINO", model: "338", km: 0 },
      { body_type: "none" },
    );
    expect(out).toContain("• Frein moteur");
    expect(out).toContain("• Freins pneumatiques");
    expect(out).toContain("• Suspension pneumatique");
    expect(out).toContain("• Roues en aluminium Alcoa");
    expect(out).toContain("Allison");
  });

  it("body fourgon_rampe ajoute longueur et rampe", () => {
    const out = suggestDescription(baseV, {
      body_type: "fourgon_rampe",
      body_length_ft: 22,
    });
    expect(out).toContain("Fourgon de 22 pieds");
    expect(out).toContain("Rampe de chargement");
    expect(out).toContain("largeur 102 po × hauteur 96 po");
  });

  it("body fourgon_sec ajoute dry-box sans accessoire", () => {
    const out = suggestDescription(baseV, {
      body_type: "fourgon_sec",
      body_length_ft: 20,
    });
    expect(out).toContain("Fourgon sec de 20 pieds");
    expect(out).toContain("largeur 102 po × hauteur 96 po");
    expect(out).not.toContain("Rampe de chargement");
    expect(out).not.toContain("Monte-charge");
    expect(out).not.toContain("réfrigération");
  });

  it("body fourgon_montecharge respecte equipment_brand", () => {
    const out = suggestDescription(baseV, {
      body_type: "fourgon_montecharge",
      body_length_ft: 20,
      equipment_brand: "Maxon TE-20",
    });
    expect(out).toContain("Monte-charge Maxon TE-20");
  });

  it("mentions de fin: prêt à travailler / excellente / SAAQ", () => {
    const out = suggestDescription(baseV, {
      body_type: "none",
      ready_to_work: true,
      excellent_condition: true,
      saaq_inspection: "Mars 2023",
    });
    expect(out).toContain("• Prêt à travailler");
    expect(out).toContain("• Excellente condition");
    expect(out).toContain("• Inspection SAAQ effectuée en Mars 2023");
  });
});
