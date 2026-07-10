import { buildMetaVehicleFeed } from "@/lib/feeds/meta-vehicle";
import { serveFeed } from "@/lib/feeds/serve";

/**
 * Meta Commerce Manager pulls this on its own schedule. Rebuilding costs one
 * LesPAC list call plus one detail call per active listing, so cache it rather
 * than hammering LesPAC every time a crawler wakes up.
 */
export const revalidate = 900; // 15 min

export function GET() {
  return serveFeed("meta", buildMetaVehicleFeed);
}
