import { describe, it, expect, vi } from "vitest";
import { fetchCatalogIncremental } from "@/lib/catalog/incremental";
import type { CatalogVehicle } from "@/lib/catalog/types";
import type { LespacListing, LespacListingSummary } from "@/lib/lespac/types";

const NOW = Date.parse("2026-07-21T12:00:00.000Z");
const MINUTE = 60_000;

function summary(over: Partial<LespacListingSummary> = {}): LespacListingSummary {
  return {
    listingId: 1,
    vendorId: null,
    title: "Isuzu NRR 2022",
    state: "USED",
    status: "ONLINE",
    ...over,
  };
}

function detail(over: Partial<LespacListing> = {}): LespacListing {
  return {
    listingId: 1,
    vendorId: null,
    category: "Véhicules - Camions",
    title: "Isuzu NRR 2022",
    description: "Bon état",
    price: 39733,
    postalCode: "G7H 1A1",
    year: 2022,
    state: "USED",
    contact: {
      type: "STANDARD",
      emailAddress: "info@camion-hino.ca",
      firstName: "Info",
      lastName: "Hino",
    },
    status: "ONLINE",
    imageURLs: ["https://cdn.lespac.com/a.jpg"],
    attributes: { Marque: "Isuzu", Kilométrage: "249 000 km" },
    ...over,
  };
}

/** A stored `payload`, i.e. a normalized CatalogVehicle sitting in the snapshot. */
function payload(over: Partial<CatalogVehicle> = {}): CatalogVehicle {
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
    exteriorColor: null,
    transmission: null,
    fuelType: null,
    photoUrls: ["https://cdn.lespac.com/a.jpg"],
    ...over,
  };
}

interface StoredRow {
  id: string;
  payload: unknown;
  detail_fetched_at: string | null;
}

/** Minimal stand-in for the admin client: one `select` on catalog_vehicle. */
function makeSupabase(rows: StoredRow[], error: { message: string } | null = null) {
  return {
    from() {
      return {
        select() {
          return Promise.resolve({ data: error ? null : rows, error });
        },
      };
    },
  } as unknown as Parameters<typeof fetchCatalogIncremental>[0];
}

function stored(id: string, ageMin: number | null, over: Partial<CatalogVehicle> = {}): StoredRow {
  return {
    id,
    payload: payload({ id, ...over }),
    detail_fetched_at: ageMin === null ? null : new Date(NOW - ageMin * MINUTE).toISOString(),
  };
}

describe("fetchCatalogIncremental", () => {
  it("ALWAYS fetches an id the snapshot has never seen", async () => {
    const getByListingId = vi.fn(async (id: number) => detail({ listingId: id }));
    const r = await fetchCatalogIncremental(makeSupabase([]), {
      listAll: async () => [summary({ listingId: 1 })],
      getByListingId,
      now: NOW,
    });

    expect(getByListingId).toHaveBeenCalledWith(1);
    expect(r.detailFetches).toBe(1);
    expect(r.refreshedIds).toEqual(["1"]);
    expect(r.vehicles.map((v) => v.id)).toEqual(["1"]);
  });

  it("reuses a payload fetched inside the TTL — ZERO detail calls", async () => {
    const getByListingId = vi.fn(async () => detail());
    const r = await fetchCatalogIncremental(
      makeSupabase([stored("1", 10, { priceCad: 31000 })]),
      {
        listAll: async () => [summary({ listingId: 1 })],
        getByListingId,
        now: NOW,
        ttlSec: 3600,
      },
    );

    // The whole point: 24 listings x 96 cycles/day of these calls is the traffic
    // that would get the shared LesPAC token throttled.
    expect(getByListingId).not.toHaveBeenCalled();
    expect(r.detailFetches).toBe(0);
    expect(r.refreshedIds).toEqual([]);
    // The lot still contains the truck — dropping it would mark it SOLD.
    expect(r.vehicles).toHaveLength(1);
    expect(r.vehicles[0].priceCad).toBe(31000); // the STORED payload, verbatim
  });

  it("re-fetches once the TTL has elapsed", async () => {
    const getByListingId = vi.fn(async () => detail({ price: 35000 }));
    const r = await fetchCatalogIncremental(
      makeSupabase([stored("1", 90, { priceCad: 31000 })]),
      {
        listAll: async () => [summary({ listingId: 1 })],
        getByListingId,
        now: NOW,
        ttlSec: 3600,
      },
    );

    expect(getByListingId).toHaveBeenCalledTimes(1);
    expect(r.detailFetches).toBe(1);
    expect(r.refreshedIds).toEqual(["1"]);
    expect(r.vehicles[0].priceCad).toBe(35000); // the FRESH detail
  });

  it("treats a null detail_fetched_at as never fetched", async () => {
    // Every row is null right after the migration; none may be trusted as fresh.
    const getByListingId = vi.fn(async () => detail());
    const r = await fetchCatalogIncremental(makeSupabase([stored("1", null)]), {
      listAll: async () => [summary({ listingId: 1 })],
      getByListingId,
      now: NOW,
      ttlSec: 3600,
    });

    expect(r.detailFetches).toBe(1);
  });

  it("re-fetches on a changed title even well inside the TTL", async () => {
    const getByListingId = vi.fn(async () => detail({ title: "Isuzu NRR 2022 — VENDU" }));
    const r = await fetchCatalogIncremental(
      makeSupabase([stored("1", 1, { title: "Isuzu NRR 2022" })]),
      {
        listAll: async () => [summary({ listingId: 1, title: "Isuzu NRR 2022 — VENDU" })],
        getByListingId,
        now: NOW,
        ttlSec: 3600,
      },
    );

    // The summary carries no price and no photos, so the title is the ONLY
    // change signal the list endpoint gives us. Ignoring it would leave a
    // retitled ad stale on the site for a full TTL.
    expect(getByListingId).toHaveBeenCalledTimes(1);
    expect(r.detailFetches).toBe(1);
    expect(r.vehicles[0].title).toBe("Isuzu NRR 2022 — VENDU");
  });

  it("respects the per-cycle cap and spends it on the oldest first", async () => {
    const getByListingId = vi.fn(async (id: number) => detail({ listingId: id }));
    const rows = [
      stored("1", 600), // oldest
      stored("2", 300),
      stored("3", 120),
      stored("4", 61), // youngest still past a 60 min TTL
    ];
    const r = await fetchCatalogIncremental(makeSupabase(rows), {
      listAll: async () => [1, 2, 3, 4].map((id) => summary({ listingId: id })),
      getByListingId,
      now: NOW,
      ttlSec: 3600,
      budget: 2,
    });

    // A mass TTL expiry must not turn into a 24-request spike.
    expect(getByListingId).toHaveBeenCalledTimes(2);
    expect(r.detailFetches).toBe(2);
    expect(r.refreshedIds).toEqual(["1", "2"]);
    // The two that lost the budget still ship their stored payload: dropping
    // them would make runCatalogSync mark two live trucks as SOLD.
    expect(r.vehicles.map((v) => v.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("spends the cap on unknown ids before refreshes", async () => {
    const getByListingId = vi.fn(async (id: number) => detail({ listingId: id }));
    const r = await fetchCatalogIncremental(
      makeSupabase([stored("1", 6000)]), // known, very stale
      {
        listAll: async () => [summary({ listingId: 1 }), summary({ listingId: 2 })],
        getByListingId,
        now: NOW,
        ttlSec: 3600,
        budget: 1,
      },
    );

    // A stale row still has a payload to ship; an unknown one has nothing, so it
    // would be missing from the site entirely.
    expect(getByListingId).toHaveBeenCalledWith(2);
    expect(getByListingId).toHaveBeenCalledTimes(1);
    expect(r.refreshedIds).toEqual(["2"]);
    expect(r.vehicles.map((v) => v.id)).toEqual(["1", "2"]);
  });

  it("returns an EMPTY lot when listAll reports nothing ONLINE", async () => {
    const getByListingId = vi.fn(async () => detail());
    const r = await fetchCatalogIncremental(makeSupabase([stored("1", 1)]), {
      listAll: async () => [summary({ listingId: 1, status: "DEACTIVATED" })],
      getByListingId,
      now: NOW,
    });

    // Empty, NOT the stored payload: runCatalogSync must see an empty lot and
    // refuse to write. Handing back stale payloads would look like a healthy
    // cycle forever.
    expect(r.vehicles).toEqual([]);
    expect(r.detailFetches).toBe(0);
    expect(getByListingId).not.toHaveBeenCalled();
  });

  it("yields no vehicles at all when listAll fails — never stale payloads", async () => {
    const getByListingId = vi.fn(async () => detail());
    const call = fetchCatalogIncremental(makeSupabase([stored("1", 1), stored("2", 1)]), {
      listAll: async () => {
        throw new Error("Lespac GET /listings → 401: token expired");
      },
      getByListingId,
      now: NOW,
    });

    // It rejects rather than swallowing: runCatalogSync's catch already refuses
    // to write AND keeps "401: token expired" as the recorded error, which an
    // empty-lot return would replace with a misleading "lot vide".
    await expect(call).rejects.toThrow(/401/);
    expect(getByListingId).not.toHaveBeenCalled();
  });

  it("refuses to guess when the snapshot read fails", async () => {
    const getByListingId = vi.fn(async () => detail());
    const call = fetchCatalogIncremental(makeSupabase([], { message: "read timeout" }), {
      listAll: async () => [summary({ listingId: 1 })],
      getByListingId,
      now: NOW,
    });

    // Treating "I could not read the snapshot" as "the snapshot is empty" would
    // classify every listing as unknown and fire a full detail sweep.
    await expect(call).rejects.toThrow(/read timeout/);
    expect(getByListingId).not.toHaveBeenCalled();
  });

  it("re-fetches a row whose stored payload is unusable", async () => {
    const getByListingId = vi.fn(async () => detail());
    const r = await fetchCatalogIncremental(
      makeSupabase([{ id: "1", payload: { id: "1" }, detail_fetched_at: new Date(NOW).toISOString() }]),
      {
        listAll: async () => [summary({ listingId: 1 })],
        getByListingId,
        now: NOW,
      },
    );

    // A truncated payload must never be shipped to a public feed just because
    // its timestamp is fresh.
    expect(r.detailFetches).toBe(1);
    expect(r.vehicles).toHaveLength(1);
  });

  it("drops a listing whose detail 404s mid-cycle", async () => {
    const r = await fetchCatalogIncremental(makeSupabase([]), {
      listAll: async () => [summary({ listingId: 1 }), summary({ listingId: 2 })],
      getByListingId: async (id: number) => (id === 2 ? null : detail({ listingId: id })),
      now: NOW,
    });

    // A 404 is a race with a deactivation. A half-listing must not reach a feed.
    expect(r.vehicles.map((v) => v.id)).toEqual(["1"]);
    expect(r.detailFetches).toBe(1);
  });
});
