import { describe, it, expect, vi, beforeEach } from "vitest";

const supabaseMock = { listing: { data: [] as unknown[], error: null as unknown }, photos: { data: [] as unknown[], error: null as unknown } };

vi.mock("@/lib/serti/wgi", () => ({
  listActiveVehicles: vi.fn(),
  getVehicleByVin: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      const data = table === "listing" ? supabaseMock.listing : supabaseMock.photos;
      return {
        select: () => ({
          in: () => Promise.resolve(data),
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: (data.data as unknown[])[0] ?? null, error: data.error }),
            order: () => Promise.resolve(data),
          }),
        }),
      };
    },
  })),
}));

import { fetchInventory, fetchVehicleByVin } from "@/lib/listings/queries";
import { listActiveVehicles, getVehicleByVin } from "@/lib/serti/wgi";

const baseVehicle = {
  vin: "V1",
  unit: "U1",
  make: "HINO",
  model: "L7",
  year: 2022,
  km: 10,
  category: "CAMION NEUF",
  status: "A" as const,
  color: "BLANC",
  cost: 50000,
};

describe("fetchInventory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.listing = { data: [], error: null };
    supabaseMock.photos = { data: [], error: null };
  });

  it("retourne defaults quand VIN absent de listing", async () => {
    (listActiveVehicles as ReturnType<typeof vi.fn>).mockResolvedValue([baseVehicle]);
    const rows = await fetchInventory();
    expect(rows[0].price_cad).toBe(0);
    expect(rows[0].is_published).toBe(false);
    expect(rows[0].photo_count).toBe(0);
    expect(rows[0].has_hero).toBe(false);
    expect(rows[0].channels).toEqual(["native", "fb", "lespac", "kijiji"]);
  });

  it("merge prix + photos quand présents", async () => {
    (listActiveVehicles as ReturnType<typeof vi.fn>).mockResolvedValue([baseVehicle]);
    supabaseMock.listing = {
      data: [{ vin: "V1", price_cad: 45000, is_published: true, channels: ["native", "fb"] }],
      error: null,
    };
    supabaseMock.photos = {
      data: [
        { vin: "V1", is_hero: true },
        { vin: "V1", is_hero: false },
      ],
      error: null,
    };
    const rows = await fetchInventory();
    expect(rows[0].price_cad).toBe(45000);
    expect(rows[0].is_published).toBe(true);
    expect(rows[0].channels).toEqual(["native", "fb"]);
    expect(rows[0].photo_count).toBe(2);
    expect(rows[0].has_hero).toBe(true);
  });

  it("retourne vide si aucun véhicule actif", async () => {
    (listActiveVehicles as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    expect(await fetchInventory()).toEqual([]);
  });
});

describe("fetchVehicleByVin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.listing = { data: [], error: null };
    supabaseMock.photos = { data: [], error: null };
  });

  it("retourne null si WGI introuvable", async () => {
    (getVehicleByVin as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect(await fetchVehicleByVin("X")).toBeNull();
  });

  it("combine WGI + listing + photos", async () => {
    (getVehicleByVin as ReturnType<typeof vi.fn>).mockResolvedValue(baseVehicle);
    supabaseMock.listing = {
      data: [
        {
          vin: "V1",
          price_cad: 25000,
          description_fr: "Nice",
          is_published: false,
          channels: ["native", "fb", "lespac", "kijiji"],
          updated_by: null,
          created_at: "",
          updated_at: "",
        },
      ],
      error: null,
    };
    supabaseMock.photos = {
      data: [
        {
          id: "p1",
          vin: "V1",
          storage_path: "V1/a.jpg",
          position: 0,
          is_hero: true,
          uploaded_by: null,
          uploaded_at: "",
        },
      ],
      error: null,
    };
    const d = await fetchVehicleByVin("V1");
    expect(d?.price_cad).toBe(25000);
    expect(d?.description_fr).toBe("Nice");
    expect(d?.photo_count).toBe(1);
    expect(d?.has_hero).toBe(true);
    expect(d?.photos).toHaveLength(1);
  });
});
