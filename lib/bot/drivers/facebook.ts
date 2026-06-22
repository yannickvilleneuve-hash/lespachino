/**
 * ⚠️  OPERATOR ACTION REQUIRED
 * ─────────────────────────────────────────────────────────────────────────────
 * The SELECTORS below are placeholders. Before this driver can post to Facebook
 * Marketplace, you MUST:
 *
 * 1. Ensure sessions/facebook.json exists (run `pnpm bot:login facebook` first).
 *
 * 2. Run Playwright codegen against the live create form:
 *      pnpm exec playwright codegen \
 *        --load-storage=sessions/facebook.json \
 *        https://www.facebook.com/marketplace/create/vehicle
 *    Click through the full flow (vehicle type, year, make, model, price,
 *    description, photos, Next, Publish). Copy each ARIA / role / label selector
 *    into the matching SELECTORS.* entry below.
 *    Prefer getByRole(...) / getByLabel(...) / [aria-label="..."] over class names.
 *
 * 3. Run codegen against an existing listing to discover edit + delete selectors:
 *      pnpm exec playwright codegen \
 *        --load-storage=sessions/facebook.json \
 *        "https://www.facebook.com/marketplace/item/<a-known-listing-id>"
 *
 * 4. Replace every "TODO" in SELECTORS. Confirm none remain:
 *      grep -n "TODO" lib/bot/drivers/facebook.ts && echo "UNFILLED SELECTORS" || echo OK
 *
 * 5. Run the manual e2e:
 *      a. pnpm bot:login facebook   (if session not already valid)
 *      b. Call facebookDriver.publish with a test listing — headless:false or PWDEBUG=1
 *      c. Confirm the ad appears on Facebook with correct title/price/description/photos
 *      d. Call facebookDriver.update with a changed price; confirm live update
 *      e. Call facebookDriver.remove; confirm the ad disappears / is marked sold
 *      f. Rename sessions/facebook.json; confirm checkSession → false, publish → SessionExpiredError
 *
 * 6. Commit: feat(bot): fill Facebook Marketplace selectors (verified live)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { BrowserContext, Page } from "playwright";
import { errors as playwrightErrors } from "playwright";

const { TimeoutError } = playwrightErrors;
import type { MirrorListing, PublishResult, PlatformDriver } from "@/lib/bot/types";
import { SessionExpiredError, TransientError, FatalError } from "@/lib/bot/types";
import { downloadPhotos, pace } from "@/lib/bot/harness";

// ─────────────────────────────────────────────────────────────────────────────
// SELECTORS — DISCOVER + FILL
// These CANNOT be known in advance; FB Marketplace ships obfuscated, rotating
// class names and no stable test ids. Discover the CURRENT selectors against the
// live site, then paste them here. Re-run discovery whenever a driver method
// starts throwing FatalError("missing element ...").
//
// Discovery command (headed, records your clicks into selector suggestions):
//   pnpm exec playwright codegen \
//     --load-storage=sessions/facebook.json \
//     https://www.facebook.com/marketplace/create/vehicle
//
// Prefer, in order:
//   getByRole(...) / getByLabel(...) ARIA queries
//   then stable attribute selectors ([aria-label="..."])
//   AVOID generated class names (they rotate on deploys).
// ─────────────────────────────────────────────────────────────────────────────
const SELECTORS = {
  // checkSession: an element only present when logged in (e.g. the Marketplace
  // composer entry point or the "Create new listing" button).
  loggedInMarker: "TODO: discover via codegen — getByRole/aria selector for a logged-in-only element",

  // publish — create vehicle form fields (in fill order):
  vehicleTypeField:  "TODO: discover via codegen",
  yearField:         "TODO: discover via codegen",
  makeField:         "TODO: discover via codegen",
  modelField:        "TODO: discover via codegen",
  priceField:        "TODO: discover via codegen",
  descriptionField:  "TODO: discover via codegen",
  // The <input type="file"> used to upload photos:
  photoInput:        "TODO: discover via codegen — the <input type=\"file\"> for photos",
  // Navigation between form steps (may not exist on single-page variant):
  nextButton:        "TODO: discover via codegen",
  // Final submission button:
  publishButton:     "TODO: discover via codegen",
  // How the live ad URL / id is exposed after successful publish:
  publishedAdLink:   "TODO: discover via codegen — the <a> or element exposing the new ad URL",

  // update / remove — manage an existing listing:
  editPriceField:       "TODO: discover via codegen — price field on edit form",
  editDescriptionField: "TODO: discover via codegen — description field on edit form",
  saveButton:           "TODO: discover via codegen — save / update button on edit form",
  deleteOrSoldButton:   "TODO: discover via codegen — delete or mark-as-sold button",
  confirmButton:        "TODO: discover via codegen — confirmation button in delete/sold dialog",
} as const;

const URLS = {
  marketplaceHome: "https://www.facebook.com/marketplace",
  createVehicle:   "https://www.facebook.com/marketplace/create/vehicle",
  /** Builds the management URL for an existing listing by its FB item id. */
  manage: (id: string) => `https://www.facebook.com/marketplace/item/${id}`,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Matches Facebook auth/challenge/recovery page patterns. */
const LOGIN_URL_RE = /\/login|\/checkpoint|\/recover|two_step_verification/i;

/**
 * Thrown internally the moment we detect a login-redirect mid-flow.
 * `classifyError` converts it to `SessionExpiredError` for callers.
 */
class LoginRedirect extends Error {
  constructor(url: string) {
    super(url);
    this.name = "LoginRedirect";
  }
}

/** Throw `LoginRedirect` if the current page URL looks like an auth/challenge page. */
function assertNotLoggedOut(page: Page): void {
  if (LOGIN_URL_RE.test(page.url())) throw new LoginRedirect(page.url());
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported pure helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface FacebookFields {
  /** Constant "Truck" for all dealer inventory. */
  vehicleType: string;
  year: string;
  make: string;
  /** Everything after make (e.g. "195 Cab & Chassis"). */
  model: string;
  /** Digits-only price string, or "" when priceCad is null. */
  price: string;
  description: string;
}

/**
 * Pure: derive Facebook Marketplace vehicle-form fields from a MirrorListing.
 *
 * Title parsing strategy:
 *   - If the first whitespace-delimited token matches /^(19|20)\d{2}$/, it is the year.
 *   - The next token (after year, if present) is the make.
 *   - All remaining tokens form the model string.
 *   - Never throws — handles empty/short titles gracefully.
 */
export function mapListingToFields(listing: MirrorListing): FacebookFields {
  const tokens = listing.title.trim().split(/\s+/).filter(Boolean);
  const yearMatch = tokens[0]?.match(/^(19|20)\d{2}$/);
  const year = yearMatch ? yearMatch[0] : "";
  const rest = year ? tokens.slice(1) : tokens;
  const make = rest[0] ?? "";
  const model = rest.slice(1).join(" ");

  return {
    vehicleType: "Truck",
    year,
    make,
    model,
    price: listing.priceCad == null ? "" : String(Math.round(listing.priceCad)),
    description: listing.description,
  };
}

/**
 * Pure-ish: map any thrown value to a typed driver error.
 *
 * Classification rules (first match wins):
 *   - Already a SessionExpiredError / TransientError / FatalError → pass through unchanged.
 *   - LoginRedirect (internal sentinel) → SessionExpiredError.
 *   - Playwright TimeoutError → TransientError.
 *   - Error message matches net::/ECONN/ENOTFOUND/ETIMEDOUT → TransientError.
 *   - page URL matches login pattern → SessionExpiredError (checked before fallthrough).
 *   - Anything else → FatalError.
 *
 * The `page` argument is optional; it is only read for its URL, never mutated.
 */
export function classifyError(err: unknown, page?: Page): Error {
  // Idempotent: already typed errors pass through.
  if (
    err instanceof SessionExpiredError ||
    err instanceof TransientError ||
    err instanceof FatalError
  ) {
    return err;
  }

  // Internal login-redirect sentinel.
  if (err instanceof LoginRedirect) {
    return new SessionExpiredError(err.message);
  }

  // Playwright timeout → transient (network / slow page).
  if (err instanceof TimeoutError) {
    return new TransientError(err.message);
  }

  // Network-level errors by message pattern → transient.
  if (
    err instanceof Error &&
    /net::|ECONN|ENOTFOUND|ETIMEDOUT/i.test(err.message)
  ) {
    return new TransientError(err.message);
  }

  // Page drifted to an auth/challenge URL → session expired.
  if (page && LOGIN_URL_RE.test(page.url())) {
    return new SessionExpiredError(`redirected to login: ${page.url()}`);
  }

  // Fallthrough → fatal (unknown element, FB UI change, etc.).
  return new FatalError(err instanceof Error ? err.message : String(err));
}

// ─────────────────────────────────────────────────────────────────────────────
// Driver methods
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cheap "am I still logged in?" check.
 * Navigates to Marketplace home and looks for a logged-in-only element.
 * Never throws — any failure returns false.
 */
async function checkSession(ctx: BrowserContext): Promise<boolean> {
  const page = await ctx.newPage();
  try {
    await page.goto(URLS.marketplaceHome, { waitUntil: "domcontentloaded" });
    if (LOGIN_URL_RE.test(page.url())) return false;
    // [DISCOVER] loggedInMarker must resolve to a logged-in-only element.
    const marker = page.locator(SELECTORS.loggedInMarker).first();
    return await marker.isVisible({ timeout: 8000 }).catch(() => false);
  } catch {
    return false; // any failure here = "not confirmably logged in"
  } finally {
    await page.close();
  }
}

/**
 * Create a new vehicle listing on Facebook Marketplace.
 *
 * Control flow:
 *   1. Map listing to form fields.
 *   2. Download photos to temp files.
 *   3. Navigate to the create-vehicle form.
 *   4. Assert we are still logged in.
 *   5. Fill each field using SELECTORS (fill order mirrors the FB form).
 *   6. Pace (human-like delay).
 *   7. Upload photos via the file input.
 *   8. Pace.
 *   9. Click Next (multi-step form) — tolerated if the form is single-page.
 *   10. Pace.
 *   11. Click Publish.
 *   12. Wait for the published-ad link and parse the externalId.
 *   13. Return { externalId, url }.
 *
 * All errors are classified via `classifyError` before being rethrown.
 */
async function publish(
  ctx: BrowserContext,
  listing: MirrorListing,
): Promise<PublishResult> {
  const fields = mapListingToFields(listing);
  const photoPaths = await downloadPhotos(listing.photoUrls);
  const page = await ctx.newPage();
  try {
    await page.goto(URLS.createVehicle, { waitUntil: "domcontentloaded" });
    assertNotLoggedOut(page);

    // [DISCOVER] Each fill/select uses a SELECTORS.* entry.
    // The control flow (order, pacing, upload, submit, url parse) is fixed;
    // only the selector strings are operator-discovered.
    await page.fill(SELECTORS.yearField, fields.year);
    await page.fill(SELECTORS.makeField, fields.make);
    await page.fill(SELECTORS.modelField, fields.model);
    if (fields.price) await page.fill(SELECTORS.priceField, fields.price);
    await page.fill(SELECTORS.descriptionField, fields.description);
    await pace();

    await page.setInputFiles(SELECTORS.photoInput, photoPaths);
    await pace();

    // Some FB form variants are multi-step (Next button); others are single-page.
    await page.click(SELECTORS.nextButton).catch(() => {
      /* no Next button on single-page variant — continue */
    });
    await pace();

    await page.click(SELECTORS.publishButton);

    // [DISCOVER] Confirm how FB exposes the new ad id/url after publish.
    const link = page.locator(SELECTORS.publishedAdLink).first();
    await link.waitFor({ timeout: 20_000 });
    const href = (await link.getAttribute("href")) ?? page.url();
    const externalId = href.match(/\/item\/(\d+)/)?.[1] ?? "";
    if (!externalId) {
      throw new FatalError(`could not parse ad id from url: ${href}`);
    }

    return { externalId, url: href };
  } catch (err) {
    throw classifyError(err, page);
  } finally {
    await page.close();
  }
}

/**
 * Update price and description on an existing Facebook Marketplace listing.
 *
 * Control flow:
 *   1. Navigate to the listing's manage URL.
 *   2. Assert still logged in.
 *   3. Fill editPriceField + editDescriptionField.
 *   4. Pace.
 *   5. Click Save.
 *   6. Pace (let the save complete before closing).
 */
async function update(
  ctx: BrowserContext,
  externalId: string,
  listing: MirrorListing,
): Promise<void> {
  const fields = mapListingToFields(listing);
  const page = await ctx.newPage();
  try {
    await page.goto(URLS.manage(externalId), { waitUntil: "domcontentloaded" });
    assertNotLoggedOut(page);

    // [DISCOVER] The "Edit listing" affordance + edit form selectors.
    await page.fill(SELECTORS.editPriceField, fields.price);
    await page.fill(SELECTORS.editDescriptionField, fields.description);
    await pace();
    await page.click(SELECTORS.saveButton);
    await pace();
  } catch (err) {
    throw classifyError(err, page);
  } finally {
    await page.close();
  }
}

/**
 * Remove (delete or mark sold) an existing Facebook Marketplace listing.
 *
 * Control flow:
 *   1. Navigate to the listing's manage URL.
 *   2. Assert still logged in.
 *   3. Click Delete / Mark as Sold button.
 *   4. Pace.
 *   5. Click the confirmation button in the dialog.
 *   6. Pace (let the action complete before closing).
 */
async function remove(
  ctx: BrowserContext,
  externalId: string,
): Promise<void> {
  const page = await ctx.newPage();
  try {
    await page.goto(URLS.manage(externalId), { waitUntil: "domcontentloaded" });
    assertNotLoggedOut(page);

    // [DISCOVER] The delete-or-mark-sold control + confirm dialog.
    await page.click(SELECTORS.deleteOrSoldButton);
    await pace();
    await page.click(SELECTORS.confirmButton);
    await pace();
  } catch (err) {
    throw classifyError(err, page);
  } finally {
    await page.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported driver
// ─────────────────────────────────────────────────────────────────────────────

export const facebookDriver: PlatformDriver = {
  platform: "facebook",
  checkSession,
  publish,
  update,
  remove,
};
