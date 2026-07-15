import { buildMetaVehicleCsv } from "@/lib/feeds/meta-vehicle-csv";
import { serveFeed } from "@/lib/feeds/serve";

/**
 * Used-truck feed for Meta, kept separate from the main /feeds/meta.csv so used
 * inventory never lands in Facebook's organic Marketplace. Point a dedicated AIA
 * (Automotive Inventory Ads) catalog at this URL to advertise used trucks only.
 * Same CSV format as the main feed; only the USED filter differs.
 */
export const revalidate = 900; // 15 min

export function GET() {
  return serveFeed(
    "meta-csv-usages",
    buildMetaVehicleCsv,
    "text/csv; charset=utf-8",
    (v) => !v.isNew,
  );
}
