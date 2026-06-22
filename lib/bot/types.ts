/**
 * Shared contract for the LesPAC mirror bot.
 *
 * Anchored on the LesPAC listing id (string), NOT the SERTI unit#.
 * Locked: do not rename these — drivers, reconciler, snapshot, hash, and the
 * dashboard all import from here.
 */

/** The platforms we mirror LesPAC listings onto. */
export type Platform = "facebook" | "kijiji" | "autotrader";

/** A LesPAC listing reduced to only the fields we publish elsewhere. */
export interface NormalizedListing {
  /** The LesPAC listing id, as a string. */
  lespacId: string;
  title: string;
  /** Asking price in CAD, or null when the listing has no posted price. */
  priceCad: number | null;
  description: string;
  /** Photo URLs in LesPAC order. */
  photoUrls: string[];
}

/** A normalized listing carrying its stable content hash. */
export interface MirrorListing extends NormalizedListing {
  contentHash: string;
}

/** Result of a successful publish: the external ad's id + public URL. */
export interface PublishResult {
  externalId: string;
  url: string;
}

// Job / PlatformDriver / error classes appended by later tasks (Phases C–D)
