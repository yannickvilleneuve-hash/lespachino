import { describe, it, expect } from "vitest";
import { chooseFeedSource, FLOOR_RATIO, MIN_ABSOLUTE } from "@/lib/feeds/floor";

/**
 * Le scénario qu'on achète avec ce module: LesPAC répond 200 avec une liste
 * vide ou tronquée, nous servons un feed amaigri, et Meta VIDE le catalogue.
 * Les publicités s'arrêtent sans une seule erreur visible.
 */
describe("chooseFeedSource", () => {
  it("sert le live quand il est en bonne santé", () => {
    expect(chooseFeedSource(19, 19)).toBe("live");
    expect(chooseFeedSource(21, 19)).toBe("live");
  });

  it("tolère une petite variation — un camion vendu n'est pas une panne", () => {
    expect(chooseFeedSource(18, 19)).toBe("live");
  });

  it("bascule sur le snapshot quand le live s'effondre", () => {
    expect(chooseFeedSource(3, 19)).toBe("snapshot");
  });

  it("bascule sur le snapshot quand le live est VIDE — le cas qui tue", () => {
    expect(chooseFeedSource(0, 19)).toBe("snapshot");
  });

  it("refuse de servir quand les deux sources sont vides", () => {
    // 503 plutôt qu'un 200 vide: Meta garde sa dernière copie valide.
    expect(chooseFeedSource(0, 0)).toBe("refuse");
  });

  it("sert le live si le snapshot est vide mais le live tient debout", () => {
    // Snapshot jamais écrit (première install, base réinitialisée): le live
    // reste la seule vérité disponible, il ne faut pas se taire pour autant.
    expect(chooseFeedSource(19, 0)).toBe("live");
  });

  it("applique le seuil exactement, sans zone grise", () => {
    const snap = 10;
    const pile = Math.ceil(FLOOR_RATIO * snap); // 8
    expect(chooseFeedSource(pile, snap)).toBe("live");
    expect(chooseFeedSource(pile - 1, snap)).toBe("snapshot");
  });

  it("respecte le minimum absolu", () => {
    expect(MIN_ABSOLUTE).toBeGreaterThan(0);
    expect(chooseFeedSource(MIN_ABSOLUTE - 1, MIN_ABSOLUTE - 1)).toBe("refuse");
  });

  it("ne se laisse pas berner par des compteurs négatifs", () => {
    expect(chooseFeedSource(-5, 19)).toBe("snapshot");
    expect(chooseFeedSource(-5, -5)).toBe("refuse");
  });
});
