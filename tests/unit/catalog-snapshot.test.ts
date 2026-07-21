import { describe, it, expect } from "vitest";
import { runCatalogSync } from "@/lib/catalog/snapshot";
import type { CatalogVehicle } from "@/lib/catalog/types";

type Row = Record<string, unknown>;

function vehicle(over: Partial<CatalogVehicle> = {}): CatalogVehicle {
  return {
    id: "1",
    title: "Isuzu NRR 2022",
    description: "Bon état",
    priceCad: 39733,
    year: 2022,
    make: "Isuzu",
    model: "NRR",
    km: 249000,
    isNew: false,
    isVehicle: true,
    bodyStyle: "TRUCK",
    exteriorColor: "Blanc",
    transmission: "AUTOMATIC",
    fuelType: "GASOLINE",
    photoUrls: ["https://cdn.lespac.com/a.jpg"],
    ...over,
  };
}

interface Capture {
  known: Row[]; // rows already in catalog_vehicle
  vehicleUpserts: Row[];
  photoUpserts: Row[];
  soldUpdates: Array<{ patch: Row; notIn: string[] }>;
  syncUpserts: Row[];
  photoDeletes: string[];
}

function emptyCapture(known: Row[] = []): Capture {
  return {
    known,
    vehicleUpserts: [],
    photoUpserts: [],
    soldUpdates: [],
    syncUpserts: [],
    photoDeletes: [],
  };
}

function makeSupabase(c: Capture) {
  return {
    from(table: string) {
      return {
        select() {
          return Promise.resolve({ data: c.known, error: null });
        },
        upsert(payload: Row | Row[]) {
          const rows = Array.isArray(payload) ? payload : [payload];
          if (table === "catalog_vehicle") c.vehicleUpserts.push(...rows);
          if (table === "catalog_photo") c.photoUpserts.push(...rows);
          if (table === "catalog_sync") c.syncUpserts.push(...rows);
          return Promise.resolve({ data: null, error: null });
        },
        update(patch: Row) {
          return {
            eq() {
              return {
                not(_c: string, _op: string, list: string) {
                  c.soldUpdates.push({
                    patch,
                    notIn: list.replace(/^\(|\)$/g, "").split(",").filter(Boolean),
                  });
                  return Promise.resolve({ data: null, error: null });
                },
              };
            },
          };
        },
        delete() {
          return {
            eq(_col: string, val: string) {
              c.photoDeletes.push(val);
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  } as unknown as Parameters<typeof runCatalogSync>[0];
}

describe("runCatalogSync", () => {
  it("writes the fetched vehicles and their photos", async () => {
    const c = emptyCapture();
    const result = await runCatalogSync(makeSupabase(c), async () => [
      vehicle({ id: "1", photoUrls: ["https://cdn.lespac.com/a.jpg", "https://cdn.lespac.com/b.jpg"] }),
    ]);

    expect(result.ok).toBe(true);
    expect(result.written).toBe(1);
    expect(c.vehicleUpserts).toHaveLength(1);
    expect(c.vehicleUpserts[0].id).toBe("1");
    expect(c.vehicleUpserts[0].status).toBe("online");
    expect(c.photoUpserts).toHaveLength(2);
    expect(c.photoUpserts[0]).toMatchObject({
      vehicle_id: "1",
      position: 0,
      source_url: "https://cdn.lespac.com/a.jpg",
    });
  });

  it("REFUSES to write an empty lot — a LesPAC hiccup must not wipe the site", async () => {
    const c = emptyCapture([{ id: "1", status: "online" }]);
    const result = await runCatalogSync(makeSupabase(c), async () => []);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/vide/i);
    expect(c.vehicleUpserts).toHaveLength(0);
    expect(c.soldUpdates).toHaveLength(0);
    expect(c.syncUpserts[0]).toMatchObject({ ok: false });
  });

  it("REFUSES to write when the fetch throws", async () => {
    const c = emptyCapture([{ id: "1", status: "online" }]);
    const result = await runCatalogSync(makeSupabase(c), async () => {
      throw new Error("Lespac GET /listings → 401: token expired");
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/401/);
    expect(c.vehicleUpserts).toHaveLength(0);
    expect(c.soldUpdates).toHaveLength(0);
  });

  it("marks vehicles absent from the fetch as sold", async () => {
    const c = emptyCapture([
      { id: "1", status: "online" },
      { id: "2", status: "online" },
    ]);
    const result = await runCatalogSync(makeSupabase(c), async () => [vehicle({ id: "1" })]);

    expect(result.sold).toBe(1);
    expect(c.soldUpdates).toHaveLength(1);
    expect(c.soldUpdates[0].patch).toMatchObject({ status: "sold" });
    expect(c.soldUpdates[0].notIn).toEqual(["1"]);
  });

  it("brings a re-listed vehicle back online and clears sold_at", async () => {
    const c = emptyCapture([{ id: "1", status: "sold" }]);
    await runCatalogSync(makeSupabase(c), async () => [vehicle({ id: "1" })]);

    expect(c.vehicleUpserts[0]).toMatchObject({ id: "1", status: "online", sold_at: null });
  });

  it("replaces the photo rows of a vehicle rather than accumulating them", async () => {
    const c = emptyCapture([{ id: "1", status: "online" }]);
    await runCatalogSync(makeSupabase(c), async () => [vehicle({ id: "1" })]);

    expect(c.photoDeletes).toContain("1");
  });
});
