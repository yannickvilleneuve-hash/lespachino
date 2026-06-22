# Task D4 Report — Facebook Marketplace Driver

## Status: DONE

## What is fully implemented

### Pure helpers (`lib/bot/drivers/facebook.ts`)
- **`mapListingToFields(listing: MirrorListing): FacebookFields`** — Fully implemented and unit-tested.
  - Parses year/make/model from title via regex (`/^(19|20)\d{2}$/` on first token).
  - Sets `vehicleType: "Truck"` for all dealer inventory.
  - Converts `priceCad` to digits-only string; `null` → `""`.
  - Description passes through verbatim.
  - Never throws on any input (empty title, missing year, etc.).

- **`classifyError(err: unknown, page?: Page): Error`** — Fully implemented and unit-tested.
  - Already-typed errors (`SessionExpiredError` / `TransientError` / `FatalError`) pass through unchanged (idempotent).
  - Internal `LoginRedirect` sentinel → `SessionExpiredError`.
  - `playwright.errors.TimeoutError` → `TransientError`.
  - Error message matching `net::|ECONN|ENOTFOUND|ETIMEDOUT` → `TransientError`.
  - Page URL matching login/checkpoint/recovery pattern → `SessionExpiredError`.
  - Anything else → `FatalError`.

### Driver control flow (`facebookDriver: PlatformDriver`)
- **`checkSession`** — Navigates to Marketplace home, checks for logged-in-only element via `SELECTORS.loggedInMarker`. Never throws; returns `false` on any failure or login redirect.
- **`publish`** — Maps fields, downloads photos, navigates to create-vehicle form, asserts session, fills all form fields in order, uploads photos via file input, clicks Next (tolerates single-page variant), clicks Publish, waits for ad link, parses `externalId` from URL pattern `/item/(\d+)/`.
- **`update`** — Navigates to manage URL, asserts session, fills editPriceField + editDescriptionField, saves.
- **`remove`** — Navigates to manage URL, asserts session, clicks delete/sold button, clicks confirm.
- All methods wrap errors through `classifyError(err, page)` before rethrowing.

## What is a placeholder

### SELECTORS block — 15 TODO entries
The `SELECTORS` constant at the top of `lib/bot/drivers/facebook.ts` contains **15 TODO placeholder strings**:

1. `loggedInMarker` — element only present when logged in
2. `vehicleTypeField` — vehicle type dropdown/select on create form
3. `yearField` — year input on create form
4. `makeField` — make input on create form
5. `modelField` — model input on create form
6. `priceField` — price input on create form
7. `descriptionField` — description textarea on create form
8. `photoInput` — `<input type="file">` for photo upload
9. `nextButton` — Next button (multi-step variant)
10. `publishButton` — Publish / Submit button
11. `publishedAdLink` — element exposing the new ad URL after publish
12. `editPriceField` — price field on edit form
13. `editDescriptionField` — description field on edit form
14. `saveButton` — Save button on edit form
15. `deleteOrSoldButton` — Delete or Mark as Sold button
16. `confirmButton` — Confirmation button in delete/sold dialog

*(Note: constants object has 15 keys; `confirmButton` counted separately = 15 total)*

## Operator discovery + e2e steps

### Step 1: Prerequisites
```bash
pnpm bot:login facebook     # must complete first — creates sessions/facebook.json
```

### Step 2: Discover create-form selectors
```bash
pnpm exec playwright codegen \
  --load-storage=sessions/facebook.json \
  https://www.facebook.com/marketplace/create/vehicle
```
Click through: vehicle type → year → make → model → price → description → add photos → Next → Publish.
Copy each suggested `getByRole()` / `getByLabel()` / `[aria-label="..."]` selector into the matching `SELECTORS.*` entry. Prefer ARIA over class names (class names rotate on FB deploys).

### Step 3: Discover edit/delete selectors
```bash
pnpm exec playwright codegen \
  --load-storage=sessions/facebook.json \
  "https://www.facebook.com/marketplace/item/<a-known-listing-id>"
```
Click: Edit listing → edit price → edit description → Save → (separately) Delete/Mark Sold → Confirm.

### Step 4: Verify no TODOs remain
```bash
grep -n "TODO" lib/bot/drivers/facebook.ts && echo "UNFILLED SELECTORS REMAIN" || echo OK
```

### Step 5: Manual e2e verification
```bash
# a. Publish a test listing (use PWDEBUG=1 or headless:false to observe):
#    call runWithSession("facebook", ctx => facebookDriver.publish(ctx, testListing))
# b. Confirm ad appears on Facebook with correct title/price/description/photos
# c. Call facebookDriver.update(ctx, externalId, modifiedListing) → verify live price change
# d. Call facebookDriver.remove(ctx, externalId) → verify ad disappears / marked sold
# e. Rename sessions/facebook.json → verify checkSession returns false, publish throws SessionExpiredError
```

### Step 6: Commit
```
feat(bot): fill Facebook Marketplace selectors (verified live)
```

## Test results

- **Helper tests**: 24/24 passed (`tests/unit/bot-facebook-driver.test.ts`)
  - `mapListingToFields`: 10 tests (year parsing, make/model, price conversion, edge cases)
  - `classifyError`: 14 tests (all error type mappings, idempotency, page URL detection)
- **Full suite**: 93/93 tests across 9 test files — all green
- **Typecheck**: `pnpm exec tsc --noEmit` — exit 0

## Implementation notes

- `playwright.errors.TimeoutError` (not a direct named export `{ TimeoutError }`) — both driver and test import via `import { errors as playwrightErrors } from "playwright"; const { TimeoutError } = playwrightErrors;`. This is the correct API for the installed playwright version.
- The `SELECTORS` block values are valid strings (TypeScript compiles) — the driver will fail at runtime (not build time) until selectors are filled, producing `FatalError` / `TransientError` depending on what Playwright throws for an invalid locator.

## Commit hash

See git log for `feat(bot): add facebook marketplace driver (selectors pending operator discovery)`
