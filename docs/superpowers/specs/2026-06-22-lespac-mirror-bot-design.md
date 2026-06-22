# LesPAC Mirror Bot — Design

**Date:** 2026-06-22
**Status:** Approved design, pending implementation plan
**Supersedes:** `docs/superpowers/plans/2026-06-03-lespac-first-republication.md` (assisted/human-publish approach) and the channel/feed/ads publication layer.

## Goal

List the dealer's for-sale units on as many platforms as possible with as much
autonomy as possible. The non-savvy user does exactly **one** thing — post on
LesPAC, as they already do. Everything else is automatic.

LesPAC stays the **source of truth** (it is purpose-built for used trucks and is
the dealer's natural habit). Our system reads LesPAC via its JSON API and drives
**headless browser bots** to mirror each listing onto Facebook Marketplace,
Kijiji, and AutoTrader — fully unattended.

## Non-negotiable constraints

- **Zero clicks for the dealer.** No listing forms, no photo manager, no publish
  buttons. The dealer's entire surface is LesPAC itself.
- **Operator is the only safety net.** When a bot gets stuck (dead session,
  CAPTCHA, page redesign), the *operator* (not the dealer) gets an email alert.
- **Radical simplicity.** The app is magic-link login + one read-only dashboard.
  Anything not serving the mirror is cut.
- **Full bot automation, accepted trade-offs.** Driving the actual websites is
  against those platforms' ToS, breaks when they change, and can trigger
  CAPTCHAs/bans. These are the dealer's own accounts posting their own inventory
  for sale. We design *around* the risk (pacing, retries, breakage alerts) — we
  do not pretend it away.

## Out of scope (explicitly cut)

- SERTI / DB2 entirely. LesPAC carries all content we publish; cost exposure is
  structurally impossible here.
- Public-facing catalogue (`app/vehicule/[unit]`), Wix embed, and lead capture.
- All feed routes (`facebook.csv/.xml`, `sandhills`, `truckpaper`, `marketbook`,
  `native.json`, `vehicles.xml`).
- Google Merchant, Meta Ads, Sandhills, channel toggles, bulk publish, assisted
  drafts, publication-proof/readiness.
- The `feature/lespac-first-republication` branch (assisted approach) — parked,
  never merged.

## Architecture

Approach **B**: a standalone worker process in the same repo, isolated from the
web app, sharing the Supabase DB and `lib/`. Each platform is a small driver
module behind a shared interface — enough structure to add platforms without
rework, no premature framework.

```
LesPAC API ──▶ [Reconciler] ──▶ jobs ──▶ [Platform driver] ──▶ FB / Kijiji / Trader
   (poll)          │  diff           CREATE/        (Playwright +         │
                   │  vs stored      UPDATE/        saved login session)  │
                   ▼                 REMOVE                                ▼
            [Supabase mirror_state] ◀──────────── result (ad url / error) ┘
                   │                                         │
                   ▼                                         ▼
            [Dashboard] (read-only board)            [Alerter] ──▶ email to operator
```

### Components

1. **Scheduler** — inside the `pacman-bot` pm2 process. Wakes on an interval
   (default hourly, configurable) and runs a sync cycle.
2. **LesPAC reader** — calls the LesPAC JSON API, returns the dealer's currently
   active listings (title, price, description, photo URLs). Reuses `lib/lespac`.
3. **Reconciler** — diffs LesPAC's current set against `mirror_state`; emits
   per-platform CREATE / UPDATE / REMOVE jobs.
4. **Platform drivers** — `facebook`, `kijiji`, `autotrader`; each implements
   `checkSession / publish / update / remove` over a Playwright context loaded
   with that platform's saved session.
5. **mirror_state (Supabase)** — per `(lespac_id, platform)` memory that makes
   the reconciler idempotent (re-running never double-posts).
6. **Alerter + Dashboard** — dedup'd email to the operator on human-needed
   failures; read-only status board in the web app.

The web app and the bot worker are separate pm2 processes. A browser crash kills
the bot, not the site (`pm2 restart pacman-bot`).

## Data model

Anchored on the **LesPAC listing id**, not SERTI unit#.

**`lespac_listing`** — lightweight snapshot, refreshed each cycle:
```
lespac_id (PK) · title · price_cad · description · photo_urls[]
content_hash · status ('active'|'gone') · first_seen · last_seen · raw(jsonb)
```
`content_hash` = hash of published fields (title/price/description/photos).
Absent from a pull → `status='gone'` (sold).

**`platform_publication`** — the mirror state (the heart):
```
id · lespac_id (FK) · platform ('facebook'|'kijiji'|'autotrader')
status ('pending'|'live'|'failed'|'removed')
external_url · external_id          -- the live ad on that platform
published_hash                      -- what we last successfully pushed
last_action ('create'|'update'|'remove') · attempt_count
last_attempt_at · last_success_at · error_message
UNIQUE(lespac_id, platform)
```
`published_hash ≠ lespac_listing.content_hash` ⇒ UPDATE due.

**`bot_event`** — append-only history: `(ts, lespac_id, platform, action,
outcome, detail)`. Powers the dashboard timeline and alert dedup.

**`platform_session`** — session health for the dashboard:
`platform · health · last_validated_at`.

**Sessions on disk** — no passwords stored. Each platform's Playwright
`storageState` lives as a file (`sessions/<platform>.json`), established once via
an interactive login and replayed by the server thereafter.

**RLS** — all tables admin-only: `authenticated` full access, `anon` none.

## The sync/reconcile loop

1. **Pull** active listings from the LesPAC API.
2. **Refresh snapshot** — upsert into `lespac_listing`, recompute `content_hash`,
   update `last_seen`. Any previously-active row absent from the pull → `gone`.
3. **Diff into jobs** per enabled platform:
   - active + no live publication → **CREATE**
   - active + live but `published_hash ≠ content_hash` → **UPDATE**
   - `gone` + live publication → **REMOVE**
4. **Execute** through the driver; write result to `platform_publication` + append
   `bot_event`.

### Safety behaviors

- **Human-paced** — jobs run sequentially per platform with randomized delays and
  a per-cycle cap (e.g. max N posts/hour). Bursts on LesPAC trickle out, not
  blast. (#1 ban-trigger mitigation.)
- **Retry with backoff** — transient failures return to `pending` and retry next
  cycle up to N attempts, then `failed` + logged. No infinite hammering.
- **Session-death short-circuit** — driver distinguishes login/challenge failure
  from ordinary failure. On session death: stop touching that platform, flip
  `platform_session` to "needs re-auth", alert the operator **once**.
- **Crash-safe by reconciliation** — state lives in Supabase; the next cycle
  re-derives reality from `mirror_state`. Known edge: post succeeds but worker
  crashes before saving the URL. Mitigation: a cheap pre-CREATE "does an ad
  already exist?" check where the platform allows it, otherwise flag for operator
  review — never silent duplicates.

## Driver contract & login

```ts
interface PlatformDriver {
  platform: "facebook" | "kijiji" | "autotrader";
  checkSession(ctx): Promise<boolean>;                 // cheap "am I logged in?"
  publish(ctx, listing): Promise<{ externalId; url }>; // CREATE
  update(ctx, externalId, listing): Promise<void>;     // UPDATE
  remove(ctx, externalId): Promise<void>;              // REMOVE
}
```

Drivers throw **typed errors** the reconciler routes on:
- `SessionExpiredError` → pause platform, alert, re-auth needed
- `TransientError` → retry next cycle
- `FatalError` (page changed) → mark failed, alert with screenshot

A **shared harness** (not each driver) handles: launching Chromium, loading and
re-saving session cookies, pacing/jitter, downloading LesPAC photos to temp files
for upload, and capturing a **screenshot on every failure** (saved + linked in
`bot_event`).

**One-time login / re-auth:**
```
pnpm bot:login <platform>
```
Launches a **visible** browser on the operator's local machine. Operator logs in
by hand (2FA, CAPTCHA, challenges — solved once by a human), it saves
`sessions/<platform>.json` and marks the session healthy. The file is then placed
on the server (scp or an authenticated dashboard upload). The server only ever
replays cookies — login never runs headless on the server.

This 2-minute local login is the **entire** manual surface of the system, and
only the operator ever touches it.

## Dashboard (the only screen)

One page, magic-link gated, read-only except two buttons.

1. **Session health banner** — `Facebook ✓ · Kijiji ✓ · AutoTrader ✗ re-auth`.
   The operator's primary cue.
2. **Needs your attention** — dead sessions, post-retry `failed` jobs, and
   crash-ambiguous "did this post twice?" flags, each with its failure screenshot
   one click away. Empty = the normal state.
3. **Listings board** — each active LesPAC listing as a row (thumbnail, title,
   price) with a status chip per platform: `live` (links to the ad), `pending`,
   `failed`, `removed`.
4. **Recent activity** — the `bot_event` timeline.
5. **Footer controls** — last/next sync time, a **Sync now** button, and the
   session re-upload entry point. The only interactive elements.

No forms, no editor, no photo manager, no channel toggles.

## Migration / cleanup

- **Delete:** all feed routes; `lib/google/*`, `lib/meta/*`; Sandhills; assisted
  drafts / marketplace-draft / publication-proof / publication-readiness /
  bulk-publication / channel-ui / channel toggles; listing form, photo manager,
  and listing editor in `app/inventaire/[unit]`; public catalogue
  (`app/vehicule/[unit]`), Wix embed, lead form + `lib/leads` + lead table; all
  SERTI usage.
- **Keep:** `lib/lespac` API client; magic-link auth (Graph); Supabase clients.
- **Git:** abandon `feature/lespac-first-republication` (parked). Stash the
  current 130 dirty files with `git stash -u` (recoverable). Build on the fresh
  `feature/lespac-mirror-bot` branch off clean `main`.

## Build order

1. Facebook Marketplace (hardest, biggest reach) — proves the full engine
   end-to-end on the worst case.
2. Kijiji.
3. AutoTrader.

Each platform is one driver module against the already-built engine, harness,
and dashboard.

## Testing

- Reconciler diff logic and idempotency — pure unit tests with mocked LesPAC
  snapshots and `mirror_state` rows (the highest-value coverage; no browser).
- Hash/change-detection — unit tests.
- Driver contract — tested against recorded fixtures where feasible; live
  Playwright runs are inherently fragile and verified manually per platform.
- Per AGENTS.md: 1–2 tests per new server-critical module; lint + typecheck
  before every commit.
