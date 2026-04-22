import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/serti/client", () => ({ queryOne: vi.fn(), query: vi.fn() }));

import { getVehicleByVin, listActiveVehicles } from "@/lib/serti/wgi";
import { queryOne, query } from "@/lib/serti/client";

describe("getVehicleByVin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mappe une ligne WGI vers Vehicle", async () => {
    (queryOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      WGISER: "1GB0G2BG8C1162818",
      WGIUNM: "C2818U",
      WGIMKE: "CHEVROLET",
      WGIMDL: "EXPRESS G3",
      WGIYEA: "2012",
      WGIODM: "145000",
      WGICAT: "CAMION USAGE",
      WGISTA: "A",
      WGICLD: "BLANC",
      WGICST: "6396.07",
      WGIDAV: "20260326",
    });
    const v = await getVehicleByVin("1GB0G2BG8C1162818");
    expect(v).toEqual({
      vin: "1GB0G2BG8C1162818",
      unit: "C2818U",
      make: "CHEVROLET",
      model: "EXPRESS G3",
      year: 2012,
      km: 145000,
      category: "CAMION USAGE",
      status: "A",
      color: "BLANC",
      cost: 6396.07,
      date_added: "2026-03-26",
    });
  });

  it("retourne null si pas trouvé", async () => {
    (queryOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect(await getVehicleByVin("X")).toBeNull();
  });

  it("trim les CHAR columns", async () => {
    (queryOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      WGISER: "ABC  ",
      WGIUNM: "U1  ",
      WGIMKE: "HINO ",
      WGIMDL: "L7   ",
      WGIYEA: "2021",
      WGIODM: "0",
      WGICAT: "CAMION NEUF         ",
      WGISTA: "A",
      WGICLD: "BLANC",
      WGICST: "0.00",
      WGIDAV: "0",
    });
    const v = await getVehicleByVin("ABC");
    expect(v?.vin).toBe("ABC");
    expect(v?.category).toBe("CAMION NEUF");
    expect(v?.make).toBe("HINO");
    expect(v?.cost).toBe(0);
    expect(v?.date_added).toBeNull();
  });
});

describe("listActiveVehicles", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne la liste mappée", async () => {
    (query as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        WGISER: "VIN1",
        WGIUNM: "U1",
        WGIMKE: "HINO",
        WGIMDL: "L7",
        WGIYEA: "2022",
        WGIODM: "50000",
        WGICAT: "CAMION NEUF",
        WGISTA: "A",
        WGICLD: "BLANC",
        WGICST: "85000.00",
        WGIDAV: "20260401",
      },
    ]);
    const v = await listActiveVehicles();
    expect(v).toHaveLength(1);
    expect(v[0].vin).toBe("VIN1");
    expect(v[0].cost).toBe(85000);
    expect(v[0].date_added).toBe("2026-04-01");
  });

  it("vide quand aucune ligne", async () => {
    (query as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    expect(await listActiveVehicles()).toEqual([]);
  });
});
