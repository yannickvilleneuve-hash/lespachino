import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/serti/client", () => ({ queryOne: vi.fn(), query: vi.fn() }));

import {
  getCostTransactionsByUnit,
  getVehicleByVin,
  listActiveVehicles,
  listInventoryVehicles,
  normalizeSertiStatus,
} from "@/lib/serti/wgi";
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
      WGIAVL: "1",
      WGIAVC: "DANS LA COURS",
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
      status_raw: "A",
      status: "available",
      color: "BLANC",
      cost: 6396.07,
      date_added: "2026-03-26",
      available: true,
      avail_raw: "1",
      avail_comment: "DANS LA COURS",
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
      WGIAVL: "2",
      WGIAVC: "",
    });
    const v = await getVehicleByVin("ABC");
    expect(v?.vin).toBe("ABC");
    expect(v?.category).toBe("CAMION NEUF");
    expect(v?.make).toBe("HINO");
    expect(v?.cost).toBe(0);
    expect(v?.date_added).toBeNull();
    expect(v?.available).toBe(false);
    expect(v?.avail_raw).toBe("2");
  });
});

describe("normalizeSertiStatus", () => {
  it("mappe A/R/S vers les statuts logiques", () => {
    expect(normalizeSertiStatus("A")).toBe("available");
    expect(normalizeSertiStatus("R")).toBe("quoted");
    expect(normalizeSertiStatus("S")).toBe("sold");
    expect(normalizeSertiStatus("")).toBe("available");
  });
});

describe("getCostTransactionsByUnit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retourne les transactions signées d'une unité", async () => {
    (query as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        WGAID: "E",
        WGADAT: "20260331",
        WGAINV: "1462067",
        WGADCI: "D",
        WGAGLA: "C110038",
        WGAAMT: "9000.00",
        WGADES: "ACHAT",
        WGAADR: "",
        WGASTK: "I0560U",
        WGANUM: "I0560U",
        WGATYP: "W",
        WGASTP: "123",
        WGARAN: "1",
      },
      {
        WGAID: "A",
        WGADAT: "20260422",
        WGAINV: "28384",
        WGADCI: "C",
        WGAGLA: "C110038",
        WGAAMT: "100.00",
        WGADES: "CREDIT",
        WGAADR: "",
        WGASTK: "I0560U",
        WGANUM: "I0560U",
        WGATYP: "W",
        WGASTP: "124",
        WGARAN: "2",
      },
    ]);

    const rows = await getCostTransactionsByUnit("I0560U");
    expect(rows).toEqual([
      expect.objectContaining({
        date: "2026-03-31",
        description: "ACHAT",
        invoice: "1462067",
        amount: 9000,
      }),
      expect.objectContaining({
        date: "2026-04-22",
        description: "CREDIT",
        invoice: "28384",
        amount: -100,
      }),
    ]);
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
        WGIAVL: "1",
        WGIAVC: "",
      },
    ]);
    const v = await listActiveVehicles();
    expect(v).toHaveLength(1);
    expect(v[0].vin).toBe("VIN1");
    expect(v[0].cost).toBe(85000);
    expect(v[0].date_added).toBe("2026-04-01");
    expect(v[0].status).toBe("available");
    expect(v[0].available).toBe(true);
  });

  it("vide quand aucune ligne", async () => {
    (query as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    expect(await listActiveVehicles()).toEqual([]);
  });
});

describe("listInventoryVehicles", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inclut les statuts S et R en plus de A (filtrés sur WGIAVL='1')", async () => {
    (query as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        WGISER: "V1",
        WGIUNM: "U1",
        WGIMKE: "HINO",
        WGIMDL: "L7",
        WGIYEA: "2022",
        WGIODM: "0",
        WGICAT: "C",
        WGISTA: "S",
        WGICLD: "",
        WGICST: "0",
        WGIDAV: "0",
        WGIAVL: "1",
        WGIAVC: "VENDU PAS LIVRE",
      },
      {
        WGISER: "V2",
        WGIUNM: "U2",
        WGIMKE: "HINO",
        WGIMDL: "L7",
        WGIYEA: "2022",
        WGIODM: "0",
        WGICAT: "C",
        WGISTA: "R",
        WGICLD: "",
        WGICST: "0",
        WGIDAV: "0",
        WGIAVL: "1",
        WGIAVC: "",
      },
    ]);
    const v = await listInventoryVehicles();
    expect(v.map((x) => x.status)).toEqual(["sold", "quoted"]);
    expect(v[0].available).toBe(true);
    expect(v[0].avail_comment).toBe("VENDU PAS LIVRE");
  });
});
