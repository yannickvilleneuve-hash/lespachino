import { buildMetaVehicleCsv } from "@/lib/feeds/meta-vehicle-csv";
import { serveFeed } from "@/lib/feeds/serve";

/**
 * Meta Commerce Manager pulls this on its own schedule. CSV rather than RSS:
 * Meta's Vehicles catalog importer rejects spec-valid RSS as an unsupported
 * format, but ingests CSV cleanly. See lib/feeds/meta-vehicle-csv.ts.
 */
export const revalidate = 900; // 15 min

export function GET() {
  return serveFeed("meta-csv", buildMetaVehicleCsv, "text/csv; charset=utf-8");
}
