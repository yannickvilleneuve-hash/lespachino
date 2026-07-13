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
  it("declares the Google base namespace Meta needs to recognize the feed", () => {
    const xml = buildMetaVehicleFeed({ origin, vehicles: [vehicle()], address });
    expect(xml).toContain(
      '<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">',
    );
  });

  it("uses listingId as vehicle_id and in the crawlable url", () => {
    const xml = buildMetaVehicleFeed({ origin, vehicles: [vehicle()], address });
    expect(xml).toContain("<g:vehicle_id>223612404</g:vehicle_id>");
    expect(xml).toContain(`<g:url>${origin}/vehicule/223612404</g:url>`);
  });

  it("percent-encodes an id containing a slash", () => {
    const xml = buildMetaVehicleFeed({
      origin,
      vehicles: [vehicle({ id: "A/B" })],
      address,
    });
    expect(xml).toContain(`<g:url>${origin}/vehicule/A%2FB</g:url>`);
  });

  it("emits every photo as a g:image/g:url, hero first", () => {
    const xml = buildMetaVehicleFeed({ origin, vehicles: [vehicle()], address });
    expect(xml).toContain(
      "<g:image>\n      <g:url>https://cdn.lespac.com/a.jpg</g:url>\n    </g:image>",
    );
    expect(xml).toContain("<g:url>https://cdn.lespac.com/b.jpg</g:url>");
    expect(xml.indexOf("a.jpg")).toBeLessThan(xml.indexOf("b.jpg"));
  });

  it("emits mileage in KILOMETERS (Meta enum, not KM)", () => {
    const xml = buildMetaVehicleFeed({ origin, vehicles: [vehicle()], address });
    expect(xml).toContain("<g:value>249000</g:value>");
    expect(xml).toContain("<g:unit>KILOMETERS</g:unit>");
  });

  it("emits the optional Meta fields when known", () => {
    const xml = buildMetaVehicleFeed({ origin, vehicles: [vehicle()], address });
    expect(xml).toContain("<g:exterior_color>Blanc</g:exterior_color>");
    expect(xml).toContain("<g:transmission>AUTOMATIC</g:transmission>");
    expect(xml).toContain("<g:fuel_type>GASOLINE</g:fuel_type>");
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
    expect(xml).not.toContain("<g:mileage>");
    expect(xml).not.toContain("<g:exterior_color>");
    expect(xml).not.toContain("<g:transmission>");
    expect(xml).not.toContain("<g:fuel_type>");
  });

  it("omits a placeholder odometer instead of asserting 10 km on a 2008 truck", () => {
    const xml = buildMetaVehicleFeed({
      origin,
      vehicles: [vehicle({ id: "222013230", year: 2008, km: 10 })],
      address,
    });
    expect(xml).toContain("<g:vehicle_id>222013230</g:vehicle_id>");
    expect(xml).not.toContain("<g:mileage>");
  });

  it("maps a new vehicle to state_of_vehicle NEW without a bogus condition", () => {
    const xml = buildMetaVehicleFeed({
      origin,
      vehicles: [vehicle({ isNew: true })],
      address,
    });
    expect(xml).toContain("<g:state_of_vehicle>NEW</g:state_of_vehicle>");
    // condition's enum is EXCELLENT/GOOD/... — new/used lives in state_of_vehicle.
    expect(xml).not.toContain("<g:condition>");
  });

  it("carries the body style through", () => {
    const xml = buildMetaVehicleFeed({
      origin,
      vehicles: [vehicle({ bodyStyle: "SUV" })],
      address,
    });
    expect(xml).toContain("<g:body_style>SUV</g:body_style>");
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
    expect(xml).toContain('<g:component name="city">Chicoutimi</g:component>');
    expect(xml).toContain('<g:component name="country">CA</g:component>');
  });

  it("renders a well-formed empty channel when there are no vehicles", () => {
    const xml = buildMetaVehicleFeed({ origin, vehicles: [], address });
    expect(xml).toContain(
      '<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">',
    );
    expect(xml).toContain("</channel>");
    expect(xml).not.toContain("<item>");
  });
});
