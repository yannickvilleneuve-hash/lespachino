import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  LespacListing,
  LespacListingSummary,
} from "@/lib/lespac/types";

const listAll = vi.fn();
const getByListingId = vi.fn();

vi.mock("@/lib/lespac/client", () => ({
  listAll: (...a: unknown[]) => listAll(...a),
  getByListingId: (...a: unknown[]) => getByListingId(...a),
}));

import { fetchActiveListings } from "@/lib/bot/lespac-reader";

const summary = (o: Partial<LespacListingSummary>): LespacListingSummary => ({
  listingId: 101,
  vendorId: "U1",
  title: "2020 Hino 195",
  state: "USED",
  status: "ONLINE",
  ...o,
});

const detail = (o: Partial<LespacListing>): LespacListing =>
  ({
    listingId: 101,
    vendorId: "U1",
    category: "Véhicules - Camions",
    title: "2020 Hino 195",
    description: "Bon camion",
    price: 50000,
    postalCode: "G6V 0A1",
    contact: {
      type: "STANDARD",
      emailAddress: "x@y.ca",
      firstName: "A",
      lastName: "B",
    },
    status: "ONLINE",
    imageURLs: ["https://img/a.jpg", "https://img/b.jpg"],
    ...o,
  }) as LespacListing;

beforeEach(() => {
  listAll.mockReset();
  getByListingId.mockReset();
});

describe("fetchActiveListings", () => {
  it("maps ONLINE listings to NormalizedListing", async () => {
    listAll.mockResolvedValue([summary({})]);
    getByListingId.mockResolvedValue(detail({}));

    const out = await fetchActiveListings();

    expect(out).toEqual([
      {
        lespacId: "101",
        title: "2020 Hino 195",
        priceCad: 50000,
        description: "Bon camion",
        photoUrls: ["https://img/a.jpg", "https://img/b.jpg"],
      },
    ]);
    expect(getByListingId).toHaveBeenCalledWith(101);
  });

  it("skips listings that are not ONLINE", async () => {
    listAll.mockResolvedValue([
      summary({ listingId: 1, status: "PENDING" }),
      summary({ listingId: 2, status: "DEACTIVATED" }),
      summary({ listingId: 3, status: "ONLINE" }),
    ]);
    getByListingId.mockResolvedValue(detail({ listingId: 3 }));

    const out = await fetchActiveListings();

    expect(out.map((l) => l.lespacId)).toEqual(["3"]);
    expect(getByListingId).toHaveBeenCalledTimes(1);
    expect(getByListingId).toHaveBeenCalledWith(3);
  });

  it("coerces missing price/description/photos to null/empty", async () => {
    listAll.mockResolvedValue([summary({})]);
    getByListingId.mockResolvedValue(
      detail({ price: null, description: null, imageURLs: undefined }),
    );

    const [out] = await fetchActiveListings();

    expect(out.priceCad).toBeNull();
    expect(out.description).toBe("");
    expect(out.photoUrls).toEqual([]);
  });

  it("skips a listing whose detail comes back null (404 race)", async () => {
    listAll.mockResolvedValue([summary({ listingId: 7 })]);
    getByListingId.mockResolvedValue(null);

    expect(await fetchActiveListings()).toEqual([]);
  });
});
