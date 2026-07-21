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

interface SelectResult {
  data: StoredRow[] | null;
  error: { message: string } | null;
}

/** A thenable PostgREST-ish query: `.eq()` chains, `await` resolves. */
interface Query {
  eq(col: string, val: string): Query;
  then(resolve: (v: SelectResult) => unknown): Promise<unknown>;
}

/**
 * Minimal stand-in for the admin client: one `select` on catalog_vehicle.
 * `filters` collects the `.eq()` calls so a test can assert what was filtered.
 */
function makeSupabase(
  rows: StoredRow[],
  error: { message: string } | null = null,
  filters: Array<[string, string]> = [],
) {
  const result: SelectResult = { data: error ? null : rows, error };
  return {
    from() {
      return {
        select() {
          const query: Query = {
            eq(col, val) {
              filters.push([col, val]);
              return query;
            },
            then(resolve) {
              return Promise.resolve(result).then(resolve);
            },
          };
          return query;
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
    // List order and age order DISAGREE on purpose. Candidates are built in
    // listAll order, so if the age tiebreak were dropped an unsorted slice would
    // take 1 and 2 and still look plausible — this fixture makes that fail.
    const rows = [
      stored("1", 61), // youngest, but first in the LesPAC list
      stored("2", 120),
      stored("3", 600), // oldest, but third
      stored("4", 300),
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
    // 24 listings against a budget of 8 means the budget is saturated 3 cycles
    // out of 4. Without oldest-first, the same few listings win every time and
    // one truck can sit at a stale price indefinitely.
    expect(r.refreshedIds).toEqual(["3", "4"]);
    expect(getByListingId).toHaveBeenNthCalledWith(1, 3);
    expect(getByListingId).toHaveBeenNthCalledWith(2, 4);
    // The two that lost the budget still ship their stored payload: dropping
    // them would make runCatalogSync mark two live trucks as SOLD.
    expect(r.vehicles.map((v) => v.id)).toEqual(["1", "2", "3", "4"]);
    expect(r.retainIds).toEqual([]);
  });

  it("orders by age INSIDE the changed-title tier too", async () => {
    const getByListingId = vi.fn(async (id: number) => detail({ listingId: id }));
    // Both titles moved, so both are TIER_CHANGED; only the age separates them,
    // and again the list order points the other way.
    const rows = [stored("1", 30), stored("2", 45)];
    const r = await fetchCatalogIncremental(makeSupabase(rows), {
      listAll: async () => [
        summary({ listingId: 1, title: "Isuzu NRR 2022 — réduit" }),
        summary({ listingId: 2, title: "Isuzu NRR 2022 — réduit" }),
      ],
      getByListingId,
      now: NOW,
      ttlSec: 3600,
      budget: 1,
    });

    expect(r.refreshedIds).toEqual(["2"]);
    expect(getByListingId).toHaveBeenCalledWith(2);
    expect(getByListingId).toHaveBeenCalledTimes(1);
  });

  it("prefers an unknown id over a stale one when age cannot break the tie", async () => {
    const getByListingId = vi.fn(async (id: number) => detail({ listingId: id }));
    const r = await fetchCatalogIncremental(
      // detail_fetched_at NULL — the stored row sorts as "never fetched", the
      // exact same age an unknown id carries.
      makeSupabase([stored("1", null)]),
      {
        listAll: async () => [summary({ listingId: 1 }), summary({ listingId: 2 })],
        getByListingId,
        now: NOW,
        ttlSec: 3600,
        budget: 1,
      },
    );

    // Age is identical, so only the tier can decide. Remove `a.tier - b.tier`
    // from the sort and listing 1 wins on stable order — this test is what makes
    // that term load-bearing instead of decorative.
    expect(getByListingId).toHaveBeenCalledWith(2);
    expect(getByListingId).toHaveBeenCalledTimes(1);
    expect(r.refreshedIds).toEqual(["2"]);
    // The stale one still ships, from its stored payload.
    expect(r.vehicles.map((v) => v.id).sort()).toEqual(["1", "2"]);
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

  it("RETAINS an unusable-payload row the budget clipped, instead of losing it", async () => {
    const getByListingId = vi.fn(async (id: number) => detail({ listingId: id }));
    // Two rows we hold, both online upstream, both with a payload too broken to
    // ship (no photoUrls). Only one fits in the budget.
    const rows: StoredRow[] = [
      { id: "1", payload: { id: "1", title: "Isuzu NRR 2022" }, detail_fetched_at: null },
      { id: "2", payload: { id: "2", title: "Isuzu NRR 2022" }, detail_fetched_at: null },
    ];
    const r = await fetchCatalogIncremental(makeSupabase(rows), {
      listAll: async () => [summary({ listingId: 1 }), summary({ listingId: 2 })],
      getByListingId,
      now: NOW,
      budget: 1,
    });

    expect(r.detailFetches).toBe(1);
    // 2 is NOT shipped — a broken payload must never reach a public feed — but
    // it must be named, or runCatalogSync sweeps a truck LesPAC just reported
    // ONLINE into status='sold' and it vanishes from /vehicule and the feed.
    expect(r.vehicles.map((v) => v.id)).toEqual(["1"]);
    expect(r.retainIds).toEqual(["2"]);
  });

  it("reads ONLY the online rows from the snapshot", async () => {
    const filters: Array<[string, string]> = [];
    const getByListingId = vi.fn(async () => detail());
    await fetchCatalogIncremental(makeSupabase([stored("1", 10)], null, filters), {
      listAll: async () => [summary({ listingId: 1 })],
      getByListingId,
      now: NOW,
      ttlSec: 3600,
    });

    // Sold rows are never deleted, and none of them can ever be reused. An
    // unfiltered select drags every payload the dealer has ever listed out of
    // Postgres 96 times a day, forever.
    expect(filters).toEqual([["status", "online"]]);
    expect(getByListingId).not.toHaveBeenCalled();
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
