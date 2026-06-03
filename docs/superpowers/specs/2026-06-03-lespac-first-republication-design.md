# LesPAC-First Republication Design

Date: 2026-06-03
Status: Approved for implementation planning

## Context

Pacman started as a multi-channel inventory and publication console. The seller
does not use that workflow because it is too large and too different from his
existing process. The platform he actually uses is LesPAC.

The product pivot keeps SERTI as the inventory source of truth, but treats
LesPAC as the source of truth for what is actually for sale publicly. Pacman
becomes an assistant that detects LesPAC listings, links them to SERTI units,
shows only active linked listings publicly, and prepares republication work for
Facebook Marketplace.

## Goals

- Keep SERTI DB2 as the authoritative inventory source for vehicle identity,
  availability, unit number, VIN, year, make, model, mileage, and cost.
- Use LesPAC API listings as the authoritative publication signal.
- Show public catalogue vehicles only when a SERTI unit is linked to an active
  LesPAC listing.
- Let the seller keep publishing on LesPAC first.
- Make Facebook Marketplace republication as fast as possible without
  automatically clicking Publish.
- Persist manual LesPAC-to-SERTI confirmations so review work is not repeated.
- Keep cost hidden from all public catalogue and public draft surfaces.

## Non-Goals

- Do not make Pacman the main LesPAC publishing UI.
- Do not reintroduce broad multi-channel bulk publication in the primary flow.
- Do not automate final Facebook Marketplace publication.
- Do not use fake profiles, account rotation, or evasion logic for Facebook.
- Do not prioritize Sandhills, TruckPaper, MarketBook, Google, or Meta Ads in
  the MVP.

## Product Model

SERTI answers: this vehicle exists and is available.

LesPAC answers: this vehicle is actually published for sale, with this public
price, description, photos, status, and listing URL.

Pacman answers: which LesPAC listings are linked to SERTI units, which SERTI
units still need LesPAC publication, and which linked listings are ready to
prepare for Facebook Marketplace.

The old internal `listing.is_published` flag no longer controls public
visibility. Public visibility is based on:

```text
SERTI available + LesPAC ONLINE + confirmed LesPAC-to-unit link
```

## LesPAC Sync

LesPAC sync uses the existing REST API, not HTML scraping:

- `GET /sell-api/v1.0/listings` lists current account listings.
- `GET /sell-api/v1.0/listings/{listingId}` fetches listing details.

The sync must run in two ways:

- On a schedule, to keep Pacman current.
- Manually from the UI, for the seller to refresh immediately after publishing
  on LesPAC.

The sync stores a local snapshot of active LesPAC listings with:

- LesPAC `listingId`
- LesPAC `vendorId`
- status, title, price, description, attributes, photo URLs, listing URL
- last synced timestamp
- matching state and review state

Listings that disappear or are no longer `ONLINE` stop making a vehicle public,
but historical links may remain for audit and future matching context.

## Matching

Pacman uses three matching levels:

1. Strong match
   - A previously confirmed link exists.
   - Or LesPAC `vendorId` maps directly to a SERTI unit.

2. Probable match
   - SERTI candidates are ranked by year, make, model, mileage, and price
     compatibility.
   - Pacman presents the best candidates with reasons and confidence.

3. Manual match
   - The user chooses a SERTI unit for the LesPAC listing.
   - The confirmation becomes the local source of truth for future syncs.

The system must not require the seller to put unit numbers in LesPAC titles or
descriptions.

## Internal UX

The main internal work page is LesPAC-first and has three sections.

### Already On LesPAC

Shows confirmed SERTI units with an active LesPAC listing. These rows appear
first and are ready for Facebook Marketplace preparation.

Each row should show:

- primary photo
- unit number
- LesPAC title
- LesPAC price
- match status
- button to prepare Facebook Marketplace
- link to the LesPAC listing

### Needs Review

Shows LesPAC listings that are active but not confidently linked. The user can
select the correct SERTI unit once.

### Publish On LesPAC First

Shows SERTI available units with no active confirmed LesPAC listing. The call to
action opens LesPAC so the seller can publish there first. After publishing, the
seller returns to Pacman and clicks Sync LesPAC.

Feeds, Meta diagnostics, Sandhills, Google, bulk publishing, and other
destination-management screens should not be the primary path after this pivot.

## Public Catalogue

The public catalogue and public vehicle pages use:

- SERTI for vehicle identity and availability.
- LesPAC for public price, public description, and public photos.
- The confirmed LesPAC-to-unit link as the publication gate.

The public catalogue must never expose SERTI cost. Existing `PublicVehicle`,
`stripCost()`, and related cost-hiding guarantees remain mandatory.

Admin surfaces may still show cost in red with the "ne pas divulguer" label.

## Facebook Marketplace Assisted Flow

Facebook Marketplace is the first republication target.

The draft is built from LesPAC plus SERTI:

- title from LesPAC, with SERTI normalization only when useful
- price from LesPAC
- description from LesPAC, lightly enriched with unit, dealer contact, and the
  public catalogue link
- photos from LesPAC
- year, make, model, mileage, and other attributes from LesPAC/SERTI

The assistant may:

- create a local draft package under `output/assisted-drafts/facebook-marketplace/<unit>/`
- open Facebook Marketplace with a persistent Playwright profile
- reuse the seller's real logged-in browser profile
- fill fields and upload photos when the UI allows it
- stop before final publication

The assistant must not:

- store the seller's Facebook password
- click Publish
- create fake profiles
- rotate accounts
- hide that the listing is commercial through evasion behavior

The UI tracks simple Facebook state:

- not prepared
- draft prepared
- published manually, if a Marketplace link is later pasted or recorded

## Facebook Business Path

The MVP keeps organic Marketplace preparation as the primary path. Meta's
business path remains secondary:

- vehicle catalogue/feed
- paid Meta Ads campaign
- possible Marketplace ad placement

This is not equivalent to free organic Marketplace listing from a business Page.
It may be documented or kept in a secondary area, but it is not part of the
first MVP path.

Relevant Meta references:

- Business Page vehicle Marketplace creation discontinued in Canada:
  https://www.facebook.com/help/326913291370580
- Marketplace vehicle listing limit:
  https://www.facebook.com/help/811082570742714
- Marketplace availability and business restrictions:
  https://www.facebook.com/help/1968285150185577

## Data Boundaries

The implementation should prefer adding a focused LesPAC publication state layer
instead of overloading the existing internal `listing` row.

Minimum persisted concepts:

- LesPAC listing snapshot
- LesPAC-to-unit link
- match score and match reasons
- review status
- confirmation metadata
- last sync timestamp
- optional Facebook Marketplace follow-up state

Existing channel state may be reused if it cleanly supports the model. If it
does not, add a small dedicated table for LesPAC publication state and keep
migration scope narrow.

## Testing

Server-critical modules should get focused unit coverage for:

- LesPAC listing normalization
- matching and scoring behavior
- public catalogue filtering
- draft generation from LesPAC data
- cost stripping on public surfaces

End-to-end browser automation for Facebook should remain best-effort and should
not be required for the core test suite, because Facebook UI and authentication
are external and unstable.

## MVP Scope

The first implementation phase includes:

- LesPAC API sync and stored snapshots
- three-level LesPAC-to-SERTI matching
- internal LesPAC-first work page
- public catalogue filtered by active confirmed LesPAC listings
- Facebook Marketplace assisted draft flow from LesPAC data

The first implementation phase excludes:

- Sandhills, TruckPaper, MarketBook, Google, Meta Ads as primary flows
- automated LesPAC publishing
- automated Facebook final publication
- broad multi-channel bulk publication
