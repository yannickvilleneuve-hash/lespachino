import { describe, it, expect } from "vitest";
import { buildMetaVehicleCsv } from "@/lib/feeds/meta-vehicle-csv";
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
    description: "Bon état, prêt à travailler",
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

/** Split a single CSV record into fields, honoring RFC 4180 quoting. */
function parseRow(row: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (inQuotes) {
      if (c === '"' && row[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(field);
      field = "";
    } else {
      field += c;
    }
  }
  out.push(field);
  return out;
}

function rows(csv: string): string[] {
  return csv.trimEnd().split("\n");
}

describe("buildMetaVehicleCsv", () => {
  it("emits a header row with Meta's vehicle columns", () => {
    const csv = buildMetaVehicleCsv({ origin, vehicles: [], address });
    const header = rows(csv)[0];
    expect(header).toBe(
      "vehicle_id,title,description,url,make,model,year,mileage.value,mileage.unit,price,state_of_vehicle,availability,body_style,exterior_color,transmission,fuel_type,image,address",
    );
  });

  it("maps a vehicle onto the columns by position", () => {
    const csv = buildMetaVehicleCsv({ origin, vehicles: [vehicle()], address });
    const cols = parseRow(rows(csv)[1]);
    expect(cols[0]).toBe("223612404"); // vehicle_id
    expect(cols[3]).toBe(`${origin}/vehicule/223612404`); // url
    expect(cols[7]).toBe("249000"); // mileage.value
    expect(cols[8]).toBe("KM"); // mileage.unit
    expect(cols[9]).toBe("39733.00 CAD"); // price
    expect(cols[10]).toBe("USED"); // state_of_vehicle
    expect(cols[12]).toBe("TRUCK"); // body_style
  });

  it("encodes images as a JSON array of {url}", () => {
    const csv = buildMetaVehicleCsv({ origin, vehicles: [vehicle()], address });
    const cols = parseRow(rows(csv)[1]);
    expect(JSON.parse(cols[16])).toEqual([
      { url: "https://cdn.lespac.com/a.jpg" },
      { url: "https://cdn.lespac.com/b.jpg" },
    ]);
  });

  it("encodes the dealer address as a JSON object", () => {
    const csv = buildMetaVehicleCsv({ origin, vehicles: [vehicle()], address });
    const cols = parseRow(rows(csv)[1]);
    expect(JSON.parse(cols[17])).toEqual({
      addr1: "123 rue Test",
      city: "Chicoutimi",
      region: "QC",
      postal_code: "G7H 1A1",
      country: "CA",
    });
  });

  it("quotes and escapes a description containing commas and quotes", () => {
    const csv = buildMetaVehicleCsv({
      origin,
      vehicles: [vehicle({ description: 'Cab, "Chassis", ready' })],
      address,
    });
    // The raw line must keep the field intact despite the internal commas.
    expect(csv).toContain('"Cab, ""Chassis"", ready"');
    const cols = parseRow(rows(csv)[1]);
    expect(cols[2]).toBe('Cab, "Chassis", ready');
  });

  it("leaves mileage empty for a placeholder odometer", () => {
    const csv = buildMetaVehicleCsv({
      origin,
      vehicles: [vehicle({ id: "222013230", year: 2008, km: 10 })],
      address,
    });
    const cols = parseRow(rows(csv)[1]);
    expect(cols[7]).toBe(""); // mileage.value
    expect(cols[8]).toBe(""); // mileage.unit
  });

  it("maps a new vehicle to state_of_vehicle NEW", () => {
    const csv = buildMetaVehicleCsv({
      origin,
      vehicles: [vehicle({ isNew: true })],
      address,
    });
    const cols = parseRow(rows(csv)[1]);
    expect(cols[10]).toBe("NEW");
  });

  it("renders header-only when there are no vehicles", () => {
    const csv = buildMetaVehicleCsv({ origin, vehicles: [], address });
    expect(rows(csv)).toHaveLength(1);
  });

  it("emits one row per vehicle plus the header", () => {
    const csv = buildMetaVehicleCsv({
      origin,
      vehicles: [vehicle(), vehicle({ id: "2" }), vehicle({ id: "3" })],
      address,
    });
    expect(rows(csv)).toHaveLength(4);
  });
});
