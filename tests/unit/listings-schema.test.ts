import { describe, expect, it } from "vitest";
import { DEFAULT_CHANNELS, normalizeChannels } from "@/lib/listings/schema";

describe("normalizeChannels", () => {
  it("mappe les anciens canaux vers les canaux réels", () => {
    expect(normalizeChannels(["native", "fb", "lespac"])).toEqual([
      "native",
      "fb_marketplace",
      "lespac",
    ]);
  });

  it("retourne les defaults quand la liste est vide", () => {
    expect(DEFAULT_CHANNELS).toEqual([
      "native",
      "wix",
      "fb_page",
      "lespac",
      "truckpaper",
      "marketbook",
    ]);
    expect(normalizeChannels([])).toEqual(DEFAULT_CHANNELS);
    expect(normalizeChannels(null)).toEqual(DEFAULT_CHANNELS);
  });

  it("peut conserver une liste vide quand aucun default n'est voulu", () => {
    expect(normalizeChannels([], [])).toEqual([]);
    expect(normalizeChannels(null, [])).toEqual([]);
  });

  it("retire les doublons et valeurs inconnues", () => {
    expect(normalizeChannels(["fb", "fb_marketplace", "bad", "wix"])).toEqual([
      "fb_marketplace",
      "wix",
    ]);
  });
});
