import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://test.supabase.co";

const supabaseMock = {
  listing: { data: [] as unknown[], error: null as unknown },
  photos: { data: [] as unknown[], error: null as unknown },
  view_event: { data: [] as unknown[], error: null as unknown },
  lead: { data: [] as unknown[], error: null as unknown },
  listing_channel_state: { data: [] as unknown[], error: null as unknown },
};

vi.mock("@/lib/serti/wgi", () => ({
  listInventoryVehicles: vi.fn(),
  getVehicleByUnit: vi.fn(),
  getCostTransactionsByUnit: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => tableHandle(table),
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => tableHandle(table),
  })),
}));

function tableHandle(table: string) {
  const key =
    table === "vehicle_photo"
      ? "photos"
      : (table as keyof typeof supabaseMock);
  const data = supabaseMock[key as keyof typeof supabaseMock];
  function thenable(): {
    in: () => ReturnType<typeof thenable>;
    eq: () => {
      maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
      order: () => ReturnType<typeof thenable>;
      gte: () => ReturnType<typeof thenable>;
    };
    gte: () => ReturnType<typeof thenable>;
    order: () => ReturnType<typeof thenable>;
    then: Promise<typeof data>["then"];
    catch: Promise<typeof data>["catch"];
  } {
    const p = Promise.resolve(data);
    return {
      in: () => thenable(),
      eq: () => ({
        maybeSingle: () =>
          Promise.resolve({ data: (data.data as unknown[])[0] ?? null, error: data.error }),
        order: () => thenable(),
        gte: () => thenable(),
      }),
      gte: () => thenable(),
      order: () => thenable(),
      then: p.then.bind(p),
      catch: p.catch.bind(p),
    };
  }
  return {
    select: () => thenable(),
    upsert: () => Promise.resolve({ data: null, error: null }),
  };
}

import { fetchInventory, fetchVehicleByUnit } from "@/lib/listings/queries";
import {
  getCostTransactionsByUnit,
  getVehicleByUnit,
  listInventoryVehicles,
} from "@/lib/serti/wgi";

const baseVehicle = {
  vin: "V1",
  unit: "U1",
  make: "HINO",
  model: "L7",
  year: 2022,
  km: 10,
  category: "CAMION NEUF",
  status_raw: "A" as const,
  status: "available" as const,
  color: "BLANC",
  cost: 50000,
  date_added: "2026-04-01",
  available: true,
  avail_raw: "1",
  avail_comment: "",
};

describe("fetchInventory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getCostTransactionsByUnit as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    supabaseMock.listing = { data: [], error: null };
    supabaseMock.photos = { data: [], error: null };
    supabaseMock.view_event = { data: [], error: null };
    supabaseMock.lead = { data: [], error: null };
    supabaseMock.listing_channel_state = { data: [], error: null };
  });

  it("retourne defaults quand unit absent de listing", async () => {
    (listInventoryVehicles as ReturnType<typeof vi.fn>).mockResolvedValue([baseVehicle]);
    const rows = await fetchInventory();
    expect(rows[0].price_cad).toBe(0);
    expect(rows[0].is_published).toBe(false);
    expect(rows[0].photo_count).toBe(0);
    expect(rows[0].has_hero).toBe(false);
    expect(rows[0].views_7d).toBe(0);
    expect(rows[0].leads_7d).toBe(0);
    expect(rows[0].channels).toEqual([
      "native",
      "wix",
      "fb_page",
      "lespac",
      "truckpaper",
      "marketbook",
    ]);
    expect(rows[0].channel_state).toEqual([]);
  });

  it("merge prix + photos + views + leads", async () => {
    (listInventoryVehicles as ReturnType<typeof vi.fn>).mockResolvedValue([baseVehicle]);
    supabaseMock.listing = {
      data: [
        {
          unit: "U1",
          price_cad: 45000,
          is_published: true,
          channels: ["native", "fb"],
          hidden: false,
        },
      ],
      error: null,
    };
    supabaseMock.photos = {
      data: [
        { unit: "U1", is_hero: true },
        { unit: "U1", is_hero: false },
      ],
      error: null,
    };
    supabaseMock.view_event = {
      data: [{ unit: "U1" }, { unit: "U1" }, { unit: "U1" }],
      error: null,
    };
    supabaseMock.lead = { data: [{ unit: "U1" }], error: null };
    supabaseMock.listing_channel_state = {
      data: [
        {
          unit: "U1",
          channel: "native",
          last_status: "published",
          last_synced_at: "2026-04-25T10:00:00Z",
          external_id: null,
          external_url: null,
          last_error: null,
        },
      ],
      error: null,
    };
    const rows = await fetchInventory();
    expect(rows[0].price_cad).toBe(45000);
    expect(rows[0].is_published).toBe(true);
    expect(rows[0].channels).toEqual(["native", "fb_marketplace"]);
    expect(rows[0].photo_count).toBe(2);
    expect(rows[0].has_hero).toBe(true);
    expect(rows[0].views_7d).toBe(3);
    expect(rows[0].leads_7d).toBe(1);
    expect(rows[0].channel_state).toHaveLength(1);
    expect(rows[0].channel_state[0].channel).toBe("native");
  });

  it("retourne vide si aucun véhicule actif", async () => {
    (listInventoryVehicles as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    expect(await fetchInventory()).toEqual([]);
  });
});

describe("fetchVehicleByUnit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.listing = { data: [], error: null };
    supabaseMock.photos = { data: [], error: null };
    supabaseMock.view_event = { data: [], error: null };
    supabaseMock.lead = { data: [], error: null };
    supabaseMock.listing_channel_state = { data: [], error: null };
  });

  it("retourne null si WGI introuvable", async () => {
    (getVehicleByUnit as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect(await fetchVehicleByUnit("X")).toBeNull();
  });

  it("combine WGI + listing + photos", async () => {
    (getVehicleByUnit as ReturnType<typeof vi.fn>).mockResolvedValue(baseVehicle);
    supabaseMock.listing = {
      data: [
        {
          unit: "U1",
          price_cad: 25000,
          description_fr: "Nice",
          is_published: false,
          channels: ["native", "fb", "lespac", "kijiji"],
          hidden: false,
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
          unit: "U1",
          storage_path: "U1/a.jpg",
          position: 0,
          is_hero: true,
          uploaded_by: null,
          uploaded_at: "",
        },
      ],
      error: null,
    };
    const d = await fetchVehicleByUnit("U1");
    expect(d?.price_cad).toBe(25000);
    expect(d?.description_fr).toBe("Nice");
    expect(d?.photo_count).toBe(1);
    expect(d?.has_hero).toBe(true);
    expect(d?.photos).toHaveLength(1);
    expect(d?.channel_state).toEqual([]);
    expect(d?.cost).toBe(50000);
    expect(d?.cost_transactions).toEqual([]);
    expect(d?.cost_transactions_total).toBe(50000);
  });

  it("utilise les transactions de coûtant quand disponibles", async () => {
    (getVehicleByUnit as ReturnType<typeof vi.fn>).mockResolvedValue(baseVehicle);
    (getCostTransactionsByUnit as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "E",
        date: "2026-03-31",
        invoice: "1462067",
        debit_credit: "D",
        gl_account: "C110038",
        amount: 9000,
        description: "ACHAT",
        address_number: "",
        stock_number: "U1",
        type: "W",
        batch_number: 1,
      },
      {
        id: "A",
        date: "2026-04-22",
        invoice: "28384",
        debit_credit: "D",
        gl_account: "C110038",
        amount: 1380,
        description: "SERVICE",
        address_number: "",
        stock_number: "U1",
        type: "W",
        batch_number: 2,
      },
    ]);
    const d = await fetchVehicleByUnit("U1");
    expect(d?.cost).toBe(10380);
    expect(d?.cost_transactions_total).toBe(10380);
    expect(d?.cost_transactions).toHaveLength(2);
  });
});
