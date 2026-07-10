import { describe, it, expect } from "vitest";
import { buildMetaVehicleFeed } from "@/lib/feeds/meta-vehicle";
import type { CatalogVehicle } from "@/lib/catalog/types";
import type { DealerAddress } from "@/lib/dealer/config";

const address: DealerAddress = {
  addr1: "123 rue Test",
  city: "Chicoutimi",
  region: "QC",
  postalCode: "G7H 1A1",
  country: "CA",
};

function vehicle(over: Partial<CatalogVehicle> = {}): CatalogVehicle {
  return {
    id: "223612404",
    title: "Isuzu NRR 2022 avec Fourgon de 20 pieds",
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
    photoUrls: ["https://cdn.lespac.com/a.jpg", "https://cdn.lespac.com/b.jpg"],
    ...over,
  };
}

const origin = "https://feeds.hinochicoutimi.com";




describe("buildMetaVehicleFeed", () => {
  it("uses listingId as vehicle_id and in the crawlable url", () => {
    const xml = buildMetaVehicleFeed({ origin, vehicles: [vehicle()], address });
    expect(xml).toContain("<vehicle_id>223612404</vehicle_id>");
    expect(xml).toContain(`<url>${origin}/vehicule/223612404</url>`);
  });

  it("percent-encodes an id containing a slash", () => {
    const xml = buildMetaVehicleFeed({
      origin,
      vehicles: [vehicle({ id: "A/B" })],
      address,
    });
    expect(xml).toContain(`<url>${origin}/vehicule/A%2FB</url>`);
  });

  it("uses the first photo as image_link", () => {
    const xml = buildMetaVehicleFeed({ origin, vehicles: [vehicle()], address });
    expect(xml).toContain("<image_link>https://cdn.lespac.com/a.jpg</image_link>");
  });

  it("emits mileage in KM", () => {
    const xml = buildMetaVehicleFeed({ origin, vehicles: [vehicle()], address });
    expect(xml).toContain("<value>249000</value>");
    expect(xml).toContain("<unit>KM</unit>");
  });

  it("emits the optional Meta fields when known", () => {
    const xml = buildMetaVehicleFeed({ origin, vehicles: [vehicle()], address });
    expect(xml).toContain("<exterior_color>Blanc</exterior_color>");
    expect(xml).toContain("<transmission>AUTOMATIC</transmission>");
    expect(xml).toContain("<fuel_type>GASOLINE</fuel_type>");
  });

  it("omits optional fields entirely rather than emitting empty tags", () => {
    const xml = buildMetaVehicleFeed({
      origin,
      vehicles: [
        vehicle({
          km: null,
          exteriorColor: null,
          transmission: null,
          fuelType: null,
        }),
      ],
      address,
    });
    expect(xml).not.toContain("<mileage>");
    expect(xml).not.toContain("<exterior_color>");
    expect(xml).not.toContain("<transmission>");
    expect(xml).not.toContain("<fuel_type>");
  });

  it("omits a placeholder odometer instead of asserting 10 km on a 2008 truck", () => {
    const xml = buildMetaVehicleFeed({
      origin,
      vehicles: [vehicle({ id: "222013230", year: 2008, km: 10 })],
      address,
    });
    expect(xml).toContain("<vehicle_id>222013230</vehicle_id>");
    expect(xml).not.toContain("<mileage>");
  });

  it("maps a new vehicle to NEW/new", () => {
    const xml = buildMetaVehicleFeed({
      origin,
      vehicles: [vehicle({ isNew: true })],
      address,
    });
    expect(xml).toContain("<state_of_vehicle>NEW</state_of_vehicle>");
    expect(xml).toContain("<condition>new</condition>");
  });

  it("carries the body style through", () => {
    const xml = buildMetaVehicleFeed({
      origin,
      vehicles: [vehicle({ bodyStyle: "SUV" })],
      address,
    });
    expect(xml).toContain("<body_style>SUV</body_style>");
  });

  it("escapes XML metacharacters in the description", () => {
    const xml = buildMetaVehicleFeed({
      origin,
      vehicles: [vehicle({ description: 'Cab & "Chassis" <b>' })],
      address,
    });
    expect(xml).toContain("Cab &amp; &quot;Chassis&quot; &lt;b&gt;");
    expect(xml).not.toContain("<b>");
  });

  it("falls back to the built title when the description is empty", () => {
    const xml = buildMetaVehicleFeed({
      origin,
      vehicles: [vehicle({ description: "" })],
      address,
    });
    expect(xml).toContain("<description>2022 Isuzu NRR</description>");
  });

  it("emits the dealer address components", () => {
    const xml = buildMetaVehicleFeed({ origin, vehicles: [vehicle()], address });
    expect(xml).toContain('<component name="city">Chicoutimi</component>');
    expect(xml).toContain('<component name="country">CA</component>');
  });

  it("renders a well-formed empty channel when there are no vehicles", () => {
    const xml = buildMetaVehicleFeed({ origin, vehicles: [], address });
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain("</channel>");
    expect(xml).not.toContain("<item>");
  });
});
