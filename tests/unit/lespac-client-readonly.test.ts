import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as client from "@/lib/lespac/client";

/**
 * LesPAC est la source #1 de l'inventaire, saisie à la main. Une ancienne
 * version de pacman y poussait des annonces et y a laissé quatre annonces au
 * modèle tronqué et au lien vendeur mort. Ces deux tests sont la serrure: si
 * quelqu'un rouvre l'écriture, ils tombent.
 */
describe("client LesPAC — lecture seule", () => {
  const WRITE_VERB = /^(upsert|create|update|delete|remove|activate|deactivate|post|put|patch|save|publish|send)/i;

  it("n'expose aucune fonction dont le nom écrit", () => {
    const offenders = Object.keys(client).filter((name) => WRITE_VERB.test(name));
    expect(offenders).toEqual([]);
  });

  describe("méthode HTTP réellement émise", () => {
    const calls: { url: string; method: string | undefined }[] = [];

    beforeEach(() => {
      calls.length = 0;
      vi.stubEnv("LESPAC_API_TOKEN", "t");
      vi.stubEnv("DEALER_POSTAL_CODE", "G7H1A1");
      vi.stubEnv("DEALER_CONTACT_EMAIL", "a@b.ca");
      vi.stubEnv("DEALER_CONTACT_FIRST_NAME", "A");
      vi.stubEnv("DEALER_CONTACT_LAST_NAME", "B");
      vi.stubEnv("DEALER_CONTACT_PHONE", "418");
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init?: RequestInit) => {
          calls.push({ url: String(url), method: init?.method });
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => [],
            text: async () => "",
          };
        }),
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    });

    it("n'émet que des GET, sur chacune des lectures exposées", async () => {
      await client.listAll();
      await client.getByListingId(222034219);
      await client.getByVendorId("F4457U");

      expect(calls).toHaveLength(3);
      expect(calls.map((c) => c.method)).toEqual(["GET", "GET", "GET"]);
    });

    it("n'envoie pas de corps de requête", async () => {
      const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
      await client.listAll();
      const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
      expect(init?.body).toBeUndefined();
    });
  });
});
