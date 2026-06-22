import type { BrowserContext } from "playwright";

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

export type JobAction = "create" | "update" | "remove";

/**
 * A single unit of work the reconciler hands to a platform driver.
 * - create: `listing` set, `externalId` null
 * - update: `listing` set, `externalId` = the live ad's id
 * - remove: `listing` null, `externalId` = the live ad's id
 */
export interface Job {
  action: JobAction;
  platform: Platform;
  lespacId: string;
  listing: MirrorListing | null;
  externalId: string | null;
}

/** Login/challenge/redirect detected — pause platform, alert, re-auth needed. */
export class SessionExpiredError extends Error {
  constructor(message = "session expired") {
    super(message);
    this.name = "SessionExpiredError";
  }
}

/** Timeout/network/recoverable — return job to pending, retry next cycle. */
export class TransientError extends Error {
  constructor(message = "transient failure") {
    super(message);
    this.name = "TransientError";
  }
}

/** Page changed / known element missing — mark failed, alert with screenshot. */
export class FatalError extends Error {
  constructor(message = "fatal failure") {
    super(message);
    this.name = "FatalError";
  }
}

export interface PlatformDriver {
  platform: Platform;
  /** Cheap "am I logged in?" — never throws SessionExpiredError, returns bool. */
  checkSession(ctx: BrowserContext): Promise<boolean>;
  publish(ctx: BrowserContext, listing: MirrorListing): Promise<PublishResult>;
  update(ctx: BrowserContext, externalId: string, listing: MirrorListing): Promise<void>;
  remove(ctx: BrowserContext, externalId: string): Promise<void>;
}
