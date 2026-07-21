/** Meta Commerce `body_style` values we can emit from LesPAC categories. */
export type BodyStyle = "TRUCK" | "SUV" | "MINIVAN" | "VAN" | "OTHER";
export type Transmission = "AUTOMATIC" | "MANUAL";
export type FuelType = "DIESEL" | "GASOLINE";

/**
 * The dealer's inventory, normalized from LesPAC — the source of truth.
 *
 * Anchored on `listingId`. NOT `vendorId`: that field is only populated on ads
 * pacman itself upserted, and is null on 20 of 25 live listings because the
 * seller posts by hand. A feed keyed on vendorId would emit empty ids.
 *
 * `listingId` changes if an ad is deactivated and re-posted. That is correct
 * behaviour, not a bug: to the platforms it is a new ad for the same truck, and
 * the old one is gone from the feed.
 */
export interface CatalogVehicle {
  /** LesPAC listingId, as a string. Feed vehicle_id and URL slug. */
  id: string;
  title: string;
  description: string;
  /** Asking price in CAD. Null on "prix à discuter" ads. */
  priceCad: number | null;
  year: number | null;
  /** Real manufacturer, derived from the title. See `resolveMake`. */
  make: string;
  model: string;
  /** Odometer in kilometers. Null when absent or unparseable. */
  km: number | null;
  isNew: boolean;
  /**
   * False for non-vehicles: bare cargo boxes and trailers listed under
   * "Pneus, pièces & équipements". They must never enter a vehicle feed.
   */
  isVehicle: boolean;
  bodyStyle: BodyStyle;
  exteriorColor: string | null;
  transmission: Transmission | null;
  fuelType: FuelType | null;
  /** Photo URLs in LesPAC order. First is the hero. */
  photoUrls: string[];
}

/**
 * What a fetch path hands `runCatalogSync`.
 *
 * The counters exist because the incremental fetcher reuses stored payloads:
 * only the vehicles listed in `refreshedIds` had their LesPAC detail re-read
 * this cycle, and only those may have `detail_fetched_at` moved forward. Moving
 * it on a reused payload would restart the TTL on data we never re-read, so the
 * TTL would never expire and the catalog would freeze.
 */
export interface CatalogFetchResult {
  vehicles: CatalogVehicle[];
  /** LesPAC detail calls actually issued this cycle. */
  detailFetches: number;
  refreshedIds: string[];
  /**
   * Ids still ONLINE upstream that this cycle could not ship: the per-cycle
   * detail budget clipped them AND their stored payload was unusable, so there
   * was nothing to fall back on. They are absent from `vehicles`, but they are
   * NOT sold — `runCatalogSync` must leave those rows alone instead of sweeping
   * them, or a live truck drops off the site and out of the Meta feed until some
   * later cycle happens to re-fetch it.
   *
   * Omitted by the full-sweep path, which ships everything it reads.
   */
  retainIds?: string[];
}
