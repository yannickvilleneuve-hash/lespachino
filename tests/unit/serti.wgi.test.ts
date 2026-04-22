import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/serti/client", () => ({ queryOne: vi.fn() }));

import { getVehicleByVin } from "@/lib/serti/wgi";
import { queryOne } from "@/lib/serti/client";

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
    });
    const v = await getVehicleByVin("ABC");
    expect(v?.vin).toBe("ABC");
    expect(v?.category).toBe("CAMION NEUF");
    expect(v?.make).toBe("HINO");
  });
});
