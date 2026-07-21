import { buildGoogleVlaFeed } from "@/lib/feeds/google-vla";
import { serveFeed } from "@/lib/feeds/serve";

/**
 * Google Vehicle Listings feed, also accepted by most automotive aggregators.
 * Same cadence as the Meta feed — see app/feeds/meta.xml/route.ts.
 */
export const revalidate = 900; // 15 min

export function GET() {
  return serveFeed("google-vla", buildGoogleVlaFeed);
}
