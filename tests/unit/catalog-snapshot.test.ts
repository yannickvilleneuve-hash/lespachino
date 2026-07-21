import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  existingPhotos: Row[]; // rows already in catalog_photo
  vehicleUpserts: Row[];
  photoUpserts: Row[];
  soldUpdates: Array<{ patch: Row; notIn: string[] }>;
  syncUpserts: Row[];
  prunes: Array<{ vehicleId: string; fromPosition: number }>;
  /** Ordered log, so a test can assert that pruning happens AFTER writing. */
  ops: string[];
  /** Table whose upsert should report an error, to exercise failure reporting. */
  failUpsertOn?: string;
  uploadOk: boolean;
}

function emptyCapture(known: Row[] = [], existingPhotos: Row[] = []): Capture {
  return {
    known,
    existingPhotos,
    vehicleUpserts: [],
    photoUpserts: [],
    soldUpdates: [],
    syncUpserts: [],
    prunes: [],
    ops: [],
    uploadOk: false,
  };
}

function makeSupabase(c: Capture) {
  return {
    from(table: string) {
      return {
        select(_cols?: string) {
          // catalog_photo reads filter by vehicle; catalog_vehicle reads are awaited raw.
          return {
            eq(_col: string, val: string) {
              return Promise.resolve({
                data: c.existingPhotos.filter((r) => r.vehicle_id === val),
                error: null,
              });
            },
            then(resolve: (v: { data: Row[]; error: null }) => unknown) {
              return Promise.resolve({ data: c.known, error: null }).then(resolve);
            },
          };
        },
        upsert(payload: Row | Row[]) {
          const rows = Array.isArray(payload) ? payload : [payload];
          if (table === "catalog_vehicle") c.vehicleUpserts.push(...rows);
          if (table === "catalog_photo") {
            c.photoUpserts.push(...rows);
            c.ops.push(`write:${rows[0]?.vehicle_id}`);
          }
          if (table === "catalog_sync") c.syncUpserts.push(...rows);
          return Promise.resolve({
            data: null,
            error: c.failUpsertOn === table ? { message: "duplicate key" } : null,
          });
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
              return {
                gte(_c: string, from: number) {
                  c.prunes.push({ vehicleId: val, fromPosition: from });
                  c.ops.push(`prune:${val}`);
                  return Promise.resolve({ data: null, error: null });
                },
              };
            },
          };
        },
      };
    },
    storage: {
      from() {
        return {
          upload: (path: string) =>
            Promise.resolve(
              c.uploadOk
                ? { data: { path }, error: null }
                : { data: null, error: { message: "no storage in test" } },
            ),
        };
      },
    },
  } as unknown as Parameters<typeof runCatalogSync>[0];
}

/** A reachable CDN returning a jpeg. */
function stubLiveCdn() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      headers: new Headers({ "content-type": "image/jpeg" }),
      arrayBuffer: async () => new ArrayBuffer(8),
    })),
  );
}

describe("runCatalogSync", () => {
  beforeEach(() => {
    // Default: the CDN is down. Tests that need a live one call stubLiveCdn().
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
  });
  afterEach(() => vi.unstubAllGlobals());

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

  it("prunes dropped photo positions only AFTER writing the new rows", async () => {
    const c = emptyCapture(
      [{ id: "1", status: "online" }],
      [
        { vehicle_id: "1", position: 0, source_url: "https://cdn.lespac.com/a.jpg", storage_path: "catalog/1/0-aaa.jpg" },
        { vehicle_id: "1", position: 1, source_url: "https://cdn.lespac.com/b.jpg", storage_path: "catalog/1/1-bbb.jpg" },
        { vehicle_id: "1", position: 2, source_url: "https://cdn.lespac.com/c.jpg", storage_path: "catalog/1/2-ccc.jpg" },
      ],
    );
    // The seller removed two photos: only position 0 survives.
    await runCatalogSync(makeSupabase(c), async () => [
      vehicle({ id: "1", photoUrls: ["https://cdn.lespac.com/a.jpg"] }),
    ]);

    expect(c.prunes).toEqual([{ vehicleId: "1", fromPosition: 1 }]);
    // Deleting first would leave the vehicle photoless for the length of the
    // mirroring pass, and an ISR render landing there caches an empty card.
    expect(c.ops).toEqual(["write:1", "prune:1"]);
  });

  it("reuses the copy we already own instead of re-downloading it", async () => {
    stubLiveCdn();
    const c = emptyCapture(
      [{ id: "1", status: "online" }],
      [{ vehicle_id: "1", position: 0, source_url: "https://cdn.lespac.com/a.jpg", storage_path: "catalog/1/0-aaa.jpg" }],
    );
    await runCatalogSync(makeSupabase(c), async () => [vehicle({ id: "1" })]);

    expect(c.photoUpserts[0].storage_path).toBe("catalog/1/0-aaa.jpg");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("KEEPS the existing mirror when the LesPAC CDN is down", async () => {
    // fetch is stubbed to fail by default — the mirror attempt returns null.
    const c = emptyCapture(
      [{ id: "1", status: "online" }],
      [{ vehicle_id: "1", position: 0, source_url: "https://cdn.lespac.com/a.jpg", storage_path: "catalog/1/0-aaa.jpg" }],
    );
    await runCatalogSync(makeSupabase(c), async () => [vehicle({ id: "1" })]);

    // Nulling this would point the site back at the CDN that is down, while a
    // perfectly good copy sits in our own bucket.
    expect(c.photoUpserts[0].storage_path).toBe("catalog/1/0-aaa.jpg");
  });

  it("reports ok:false when a write fails, instead of claiming success", async () => {
    const c = emptyCapture([{ id: "1", status: "online" }]);
    c.failUpsertOn = "catalog_vehicle";
    const result = await runCatalogSync(makeSupabase(c), async () => [vehicle({ id: "1" })]);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/duplicate key/);
    // catalog_sync is the only freshness signal an operator has; it must not lie.
    expect(c.syncUpserts[0]).toMatchObject({ ok: false });
  });
});
