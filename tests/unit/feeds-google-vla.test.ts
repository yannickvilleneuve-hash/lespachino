import { describe, it, expect } from "vitest";
import { buildGoogleVlaFeed } from "@/lib/feeds/google-vla";
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
    id: "220953033",
    title: "Ford E-450 2019 avec Fourgon de 16 pieds",
    description: "Bon état",
    priceCad: 17847,
    year: 2019,
    make: "Ford",
    model: "E-450",
    km: 198000,
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

const origin = "https://hino1-thinkcentre-m93p.tail0e1ea8.ts.net:8443";

describe("buildGoogleVlaFeed", () => {
  it("declares the Google Merchant namespace", () => {
    const xml = buildGoogleVlaFeed({ origin, vehicles: [vehicle()], address });
    expect(xml).toContain('xmlns:g="http://base.google.com/ns/1.0"');
  });

  it("namespaces the vehicle fields", () => {
    const xml = buildGoogleVlaFeed({ origin, vehicles: [vehicle()], address });
    expect(xml).toContain("<g:vehicle_id>220953033</g:vehicle_id>");
    expect(xml).toContain("<g:make>Ford</g:make>");
    expect(xml).toContain("<g:model>E-450</g:model>");
    expect(xml).toContain("<g:year>2019</g:year>");
    expect(xml).toContain("<g:price>17847.00 CAD</g:price>");
  });

  it("leaves title and description un-namespaced, as RSS requires", () => {
    const xml = buildGoogleVlaFeed({ origin, vehicles: [vehicle()], address });
    expect(xml).toContain("<title>2019 Ford E-450</title>");
    expect(xml).not.toContain("<g:title>");
    expect(xml).not.toContain("<g:description>");
  });

  it("uses <link>, not <url>", () => {
    const xml = buildGoogleVlaFeed({ origin, vehicles: [vehicle()], address });
    expect(xml).toContain(`<link>${origin}/vehicule/220953033</link>`);
    expect(xml).not.toContain("<url>");
  });

  it("says 'in stock' where Meta says 'available'", () => {
    const xml = buildGoogleVlaFeed({ origin, vehicles: [vehicle()], address });
    expect(xml).toContain("<g:availability>in stock</g:availability>");
    expect(xml).not.toContain("available</g:availability>");
  });

  it("nests mileage under the g: namespace", () => {
    const xml = buildGoogleVlaFeed({ origin, vehicles: [vehicle()], address });
    expect(xml).toContain("<g:value>198000</g:value>");
    expect(xml).toContain("<g:unit>KM</g:unit>");
  });

  it("omits a placeholder odometer, like the Meta feed", () => {
    const xml = buildGoogleVlaFeed({
      origin,
      vehicles: [vehicle({ year: 2008, km: 10 })],
      address,
    });
    expect(xml).not.toContain("<g:mileage>");
    expect(xml).toContain("<g:vehicle_id>220953033</g:vehicle_id>");
  });

  it("emits the flat g:address block, not Meta's component form", () => {
    const xml = buildGoogleVlaFeed({ origin, vehicles: [vehicle()], address });
    expect(xml).toContain("<g:city>Chicoutimi</g:city>");
    expect(xml).not.toContain('<component name="city">');
  });

  it("omits optional fields rather than emitting empty tags", () => {
    const xml = buildGoogleVlaFeed({
      origin,
      vehicles: [
        vehicle({ exteriorColor: null, transmission: null, fuelType: null }),
      ],
      address,
    });
    expect(xml).not.toContain("<g:exterior_color>");
    expect(xml).not.toContain("<g:transmission>");
    expect(xml).not.toContain("<g:fuel_type>");
  });

  it("renders a well-formed empty channel when there are no vehicles", () => {
    const xml = buildGoogleVlaFeed({ origin, vehicles: [], address });
    expect(xml).toContain("</channel>");
    expect(xml).not.toContain("<item>");
  });
});

describe("the two feeds are not interchangeable", () => {
  it("differ on the fields each platform rejects the other's form of", () => {
    const v = [vehicle()];
    const meta = buildMetaVehicleFeed({ origin, vehicles: v, address });
    const google = buildGoogleVlaFeed({ origin, vehicles: v, address });

    // Meta's vehicle URL field is `url`; Google's is the RSS-core `link`.
    expect(meta).toContain("<g:url>");
    expect(google).not.toContain("<g:url>");
    expect(google).toContain("<link>");

    expect(meta).toContain("<g:availability>available</g:availability>");
    expect(google).toContain("<g:availability>in stock</g:availability>");

    // Both are g:-namespaced RSS, but Meta nests images and drops condition.
    expect(meta).toContain("xmlns:g");
    expect(google).toContain("xmlns:g");
    expect(meta).toContain("<g:image>");
    expect(google).toContain("<g:image_link>");
    expect(meta).not.toContain("<g:condition>");
  });
});
