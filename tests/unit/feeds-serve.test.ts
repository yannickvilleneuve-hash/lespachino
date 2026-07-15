import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CatalogVehicle } from "@/lib/catalog/types";

/**
 * serveFeed's `filter` splits the catalog across Meta surfaces: new trucks in the
 * main feed, used trucks in a dedicated AIA feed. This guards that used trucks
 * never leak into the main feed (Facebook organic Marketplace) and vice versa.
 */

const fetchCatalog = vi.fn<() => Promise<CatalogVehicle[]>>();

vi.mock("@/lib/catalog/fetch", () => ({ fetchCatalog: () => fetchCatalog() }));
vi.mock("next/headers", () => ({
  headers: async () => new Map<string, string>(),
}));

function vehicle(over: Partial<CatalogVehicle> = {}): CatalogVehicle {
  return {
    id: "1",
    title: "t",
    description: "d",
    priceCad: 1000,
    year: 2022,
    make: "Isuzu",
    model: "NRR",
    km: 1000,
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

// Renderer that just lists the ids it was handed, so the test asserts on
// selection, not on CSV/XML formatting (covered by the builder tests).
const idList = ({ vehicles }: { vehicles: CatalogVehicle[] }) =>
  vehicles.map((v) => v.id).join(",");

describe("serveFeed filter", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchCatalog.mockReset();
    process.env.FEED_ORIGIN = "https://feeds.hinochicoutimi.com";
  });

  it("main feed keeps NEW only; used trucks are excluded", async () => {
    fetchCatalog.mockResolvedValue([
      vehicle({ id: "new-1", isNew: true }),
      vehicle({ id: "used-1", isNew: false }),
    ]);
    const { serveFeed } = await import("@/lib/feeds/serve");
    const res = await serveFeed("t", idList, "text/csv", (v) => v.isNew);
    expect(await res.text()).toBe("new-1");
    expect(res.headers.get("X-Feed-Included")).toBe("1");
    expect(res.headers.get("X-Feed-Total")).toBe("2");
  });

  it("used feed keeps USED only; new trucks are excluded", async () => {
    fetchCatalog.mockResolvedValue([
      vehicle({ id: "new-1", isNew: true }),
      vehicle({ id: "used-1", isNew: false }),
    ]);
    const { serveFeed } = await import("@/lib/feeds/serve");
    const res = await serveFeed("t", idList, "text/csv", (v) => !v.isNew);
    expect(await res.text()).toBe("used-1");
    expect(res.headers.get("X-Feed-Included")).toBe("1");
  });

  it("no filter includes every eligible vehicle", async () => {
    fetchCatalog.mockResolvedValue([
      vehicle({ id: "new-1", isNew: true }),
      vehicle({ id: "used-1", isNew: false }),
    ]);
    const { serveFeed } = await import("@/lib/feeds/serve");
    const res = await serveFeed("t", idList, "text/csv");
    expect(await res.text()).toBe("new-1,used-1");
    expect(res.headers.get("X-Feed-Included")).toBe("2");
  });
});
