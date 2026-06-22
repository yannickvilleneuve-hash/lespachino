# LesPAC Mirror Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an autonomous worker that mirrors the dealer's active LesPAC listings onto Facebook Marketplace (then Kijiji, then AutoTrader) with zero clicks for the dealer — post on new, update on change, remove on sold.

**Architecture:** A standalone `pacman-bot` worker process (separate pm2 app, same repo) polls the LesPAC JSON API, diffs against a Supabase mirror-state, and drives headless Playwright browsers using saved login sessions to create/update/remove ads. The web app shrinks to magic-link login + one read-only status dashboard. State lives in Supabase, making every cycle idempotent and crash-safe. Operator (not the dealer) is alerted by email when a browser session dies or a post fails.

**Tech Stack:** Next.js 16 (App Router, Turbopack), TypeScript, Supabase Postgres/RLS, Playwright (headless Chromium), Microsoft Graph mail, Vitest, pm2.

**Spec:** `docs/superpowers/specs/2026-06-22-lespac-mirror-bot-design.md`

## Global Constraints

- **Next.js 16:** `params`/`searchParams`/`cookies()` are Promises — always `await`. Use `proxy.ts` not `middleware.ts`. `serverExternalPackages` for native modules.
- **PK / anchor:** the LesPAC listing id (`lespacId`, a string), NOT SERTI unit#. SERTI is entirely out of scope and removed.
- **No cost / no SERTI:** nothing in this system touches SERTI or `WGICST`. The exposure risk is structurally absent.
- **RLS:** all 4 new tables — `authenticated` full access, no `anon` policy.
- **Sessions:** no passwords stored; only Playwright `storageState` cookie files under `sessions/` (git-ignored). Login is interactive + local; the server only replays cookies.
- **Driver safety contract:** drivers throw `SessionExpiredError` (login/challenge), `TransientError` (retryable), or `FatalError` (page changed / unknown). The reconciler/cycle routes on these exact classes.
- **Pacing:** jobs run sequentially per platform with randomized delays and a per-cycle cap. Never parallel browser sessions on one platform.
- **Conventions (AGENTS.md):** `fetch*`/`getBy*` fetchers; imperative server actions; `createClient()` (cookie) vs `createAdminClient()` (service_role); `pnpm lint` + `pnpm typecheck` green before every commit; 1–2 tests per server-critical module.
- **Commit trailers:** every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
  ```

## Execution order & task numbering

Execute phases A→E in order; tasks are sequential **within** each phase (Phase A Task 1, 2, …). The shared contract file `lib/bot/types.ts` is created in Phase B and appended to in Phases C–D; do not reorder across phases.

## Phase map

- **Phase A — Foundation & Cleanup:** stash scratch, delete the cut list, trim `lib/lespac` to a read client, scaffold `lib/bot/` + worker + pm2.
- **Phase B — Data & Engine:** migration (4 tables), shared types, hash, LesPAC reader, snapshot.
- **Phase C — Reconciler & Mirror State:** the pure, exhaustively-tested core.
- **Phase D — Browser layer:** harness, login CLI, Facebook driver, driver registry.
- **Phase E — Orchestration & Dashboard:** config, alerter, `runCycle`, worker/pm2 wiring, dashboard.

## Cross-cutting reconciliation (read before Phase B & A)

These resolve overlaps between phases — apply them where the phase tasks are written:

1. **`bot_event` columns (Phase B migration):** `platform` and `lespac_id` are **nullable** (alert/cycle events carry neither). The alerter (Phase E) dedups on `detail->>'dedupKey'` within a 24h window keyed on `created_at` — no separate column needed. The `outcome` CHECK must permit the alerter's value (`'sent'`), so it is `IN ('success','failure','skipped','sent')`.
2. **`lib/bot/types.ts` ownership:** Phase B creates it with `Platform`, `NormalizedListing`, `MirrorListing`, **and `PublishResult`**. Phase C appends `JobAction` + `Job`. Phase D appends the three error classes + `PlatformDriver`. One file, three append points — never re-created.
3. **`lib/lespac` trim (Phase A):** keep only the read path used by the reader (`client.ts` `listAll()`/`getByListingId()`, `types.ts`, `config.ts`). Delete `import.ts`, `mapping.ts`, `sync.ts`, `actions.ts` (they import now-deleted `lib/listings`/`lib/serti`). Phase A includes this as an explicit task.
4. **`lib/listings` deletion (Phase A):** orphaned by the SERTI + catalogue cut and unused by the bot — delete the directory wholesale; `pnpm build` confirms no remaining importers.
5. **Generated types lag:** until the Phase B migration's types land in `lib/supabase/types.ts`, Supabase `.from("platform_publication"/…)` calls may need an `as never` cast; remove once types are regenerated via the Supabase MCP.

---


# Phase A — Foundation & Cleanup

## Section: Foundation & Cleanup

> Source spec: `docs/superpowers/specs/2026-06-22-lespac-mirror-bot-design.md` (Migration / cleanup).
> Branch: `feature/lespac-mirror-bot` (already checked out, off `main`).
>
> **Key fact (verified):** the bulk of the spec's named cut list
> (assisted-drafts, marketplace-draft, publication-proof / -readiness /
> -confirmations, bulk-publication, channel-ui, facebook-marketplace, meta
> ads/bulk feeds, photo-placeholders, fetch-evidence) exists ONLY as **untracked
> working-tree files** in the current 130 dirty files. `git stash push -u`
> (Task 1) removes them from the tree wholesale; they need NO separate `git rm`.
> Tasks 2–7 therefore delete only files that are **committed on `main`**.
>
> **Migrations are intentionally NOT deleted.** They are already applied to the
> live Supabase project; removing the SQL files does not unapply them and only
> desyncs `supabase/migrations/`. New mirror-bot tables get NEW forward
> migrations in a later plan section. Leaving the historical channel/lead/feed
> migration files in place is correct.
>
> **Coupling warning (out of scope for this section):** `lib/lespac/import.ts`
> and `lib/lespac/mapping.ts` import from `lib/listings/*` and `lib/serti/wgi`,
> because today's `lib/lespac` pushes data *to* LesPAC (opposite of the new bot,
> which *reads* LesPAC). The spec says "Keep `lib/lespac` API client" — but the
> deletions in Tasks 5–6 WILL break those two files. They are deliberately left
> for the LesPAC-reader plan section to rewrite/trim; this section only deletes
> the listings/SERTI dependencies and records the resulting dangling imports.
> The `pnpm typecheck` at the end of each cluster is expected to surface them;
> the engineer removes the now-orphaned tracked consumers as instructed and
> defers the `lib/lespac` rewrite.

---

### Task 1: Stash the 130 dirty files (recoverable) and confirm a clean `main` tree

**Files:** none created/modified/deleted in git history; working tree only.
**Interfaces:** Consumes none. Produces none.

- [ ] **Step 1: Confirm branch and dirty count.**
  Run:
  ```bash
  cd /home/hino1/pacman
  git branch --show-current
  git status --porcelain | wc -l
  ```
  Expected: `feature/lespac-mirror-bot` and `130`. If the count differs, STOP and
  reconcile with the operator before stashing — the stash must capture exactly
  the current scratch state.

- [ ] **Step 2: Stash everything, including untracked, with a recovery label.**
  Run:
  ```bash
  cd /home/hino1/pacman
  git stash push -u -m "pre-pivot scratch (recoverable)"
  ```
  Expected output ends with `Saved working directory and index state On feature/lespac-mirror-bot: pre-pivot scratch (recoverable)`.

- [ ] **Step 3: Verify the stash exists and is recoverable.**
  Run:
  ```bash
  cd /home/hino1/pacman
  git stash list
  ```
  Expected: one line, `stash@{0}: On feature/lespac-mirror-bot: pre-pivot scratch (recoverable)`.
  (Recovery later if ever needed: `git stash show -p stash@{0}` to inspect,
  `git stash apply stash@{0}` to restore. Do NOT `git stash drop` it.)

- [ ] **Step 4: Confirm the working tree is clean and equals `main`'s tree.**
  Run:
  ```bash
  cd /home/hino1/pacman
  git status --porcelain
  git diff --stat main -- . ':(exclude)docs/superpowers/specs/2026-06-22-lespac-mirror-bot-design.md'
  ```
  Expected: `git status --porcelain` prints nothing (clean tree). The `git diff`
  against `main` prints nothing except possibly the new spec file if it was
  committed on the branch — no source-code differences. The tree now matches
  `main`.

- [ ] **Step 5: No commit.** This task changes no tracked files; there is nothing
  to commit. Proceed to Task 2.

---

### Task 2: Delete all feed routes and feed libs

**Files (Delete):**
- `app/feed/facebook.csv/route.ts`
- `app/feed/facebook.xml/route.ts`
- `app/feed/marketbook.csv/route.ts`
- `app/feed/native.json/route.ts`
- `app/feed/sandhills.csv/route.ts`
- `app/feed/truckpaper.csv/route.ts`
- `app/feed/vehicles.xml/route.ts`
- `lib/feeds/commercial-truck-csv.ts`
- `lib/feeds/google-vla.ts`
- `lib/feeds/meta-vehicle.ts`

**Interfaces:** Consumes none. Produces none.

- [ ] **Step 1: Delete the feed route directory and the feed libs.**
  Run:
  ```bash
  cd /home/hino1/pacman
  git rm -r app/feed lib/feeds
  ```
  Expected: `rm 'app/feed/facebook.csv/route.ts'` … through `rm 'lib/feeds/meta-vehicle.ts'` (10 paths).

- [ ] **Step 2: Find any remaining references to the deleted feed modules.**
  Run:
  ```bash
  cd /home/hino1/pacman
  grep -rn -E "@/lib/feeds|app/feed|commercial-truck-csv|google-vla|meta-vehicle" \
    --include='*.ts' --include='*.tsx' --include='*.mjs' . | grep -v node_modules
  ```
  Remove or adjust every hit that is an `import`/`require` of a deleted module.
  (`app/sitemap.ts` and `app/robots.ts` may reference `/feed` URLs — delete those
  entries.) If a hit is only in a doc/comment, leave it. Re-run the grep until it
  prints nothing actionable.

- [ ] **Step 3: Typecheck.**
  Run:
  ```bash
  cd /home/hino1/pacman
  pnpm typecheck
  ```
  Expected: exit 0. If errors point at the listings/serti coupling (NOT at feeds),
  note them — they are handled in Tasks 5–6; fix only feed-related dangling
  imports here.

- [ ] **Step 4: Commit.**
  Run:
  ```bash
  cd /home/hino1/pacman
  git add -A
  git commit -m "$(cat <<'EOF'
chore: delete all feed routes and feed libs

Cut per lespac-mirror-bot design: facebook/marketbook/native/sandhills/
truckpaper/vehicles feed routes + lib/feeds generators. The bot mirrors
LesPAC directly; no static feeds remain.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
EOF
)"
  ```

---

### Task 3: Delete Google Merchant, Meta Ads, and Sandhills (libs, dashboard pages, docs)

**Files (Delete):**
- `lib/google/actions.ts`
- `lib/google/diagnostics.ts`
- `lib/google/push.ts`
- `lib/meta/actions.ts`
- `lib/meta/diagnostics.ts`
- `lib/meta/page.ts`
- `lib/meta/push.ts`
- `app/dashboard/google/google-actions.tsx`
- `app/dashboard/google/page.tsx`
- `app/dashboard/meta/meta-actions.tsx`
- `app/dashboard/meta/page.tsx`
- `app/inventaire/sandhills/page.tsx`
- `app/inventaire/sandhills/sandhills-helper.tsx`
- `docs/sandhills-automation.md`

**Interfaces:** Consumes none. Produces none.

- [ ] **Step 1: Delete the Google/Meta libs and dashboard pages plus Sandhills.**
  Run:
  ```bash
  cd /home/hino1/pacman
  git rm -r lib/google lib/meta app/dashboard/google app/dashboard/meta \
    app/inventaire/sandhills docs/sandhills-automation.md
  ```
  Expected: 14 `rm '...'` lines.

- [ ] **Step 2: Remove the Meta Pixel client and any pixel wiring (Meta Ads tracking).**
  Run:
  ```bash
  cd /home/hino1/pacman
  grep -rn -E "@/lib/google|@/lib/meta|meta-pixel|MetaPixel|dashboard/google|dashboard/meta|sandhills" \
    --include='*.ts' --include='*.tsx' --include='*.mjs' . | grep -v node_modules
  ```
  For each hit that imports a deleted module, remove the import and the usage.
  `app/meta-pixel.tsx` and its mount in `app/layout.tsx` are Meta Ads tracking —
  delete `app/meta-pixel.tsx` (`git rm app/meta-pixel.tsx`) and remove its
  `<MetaPixel />` usage + import from `app/layout.tsx`. Any `app/app-header.tsx`
  nav links to `/dashboard/google` or `/dashboard/meta` must be removed.
  Re-run the grep until only doc/comment hits remain.

- [ ] **Step 3: Typecheck.**
  Run:
  ```bash
  cd /home/hino1/pacman
  pnpm typecheck
  ```
  Expected: exit 0 (modulo the known listings/serti coupling deferred to Tasks 5–6).

- [ ] **Step 4: Commit.**
  Run:
  ```bash
  cd /home/hino1/pacman
  git add -A
  git commit -m "$(cat <<'EOF'
chore: delete Google Merchant, Meta Ads, and Sandhills integrations

Removes lib/google, lib/meta, their dashboard pages, the Meta Pixel
client, and Sandhills page + automation doc. None are part of the
LesPAC mirror bot.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
EOF
)"
  ```

---

### Task 4: Delete the public catalogue, Wix embed/sync, and lead capture

**Files (Delete):**
- `app/vehicule/[unit]/gallery.tsx`
- `app/vehicule/[unit]/lead-form.tsx`
- `app/vehicule/[unit]/page.tsx`
- `app/vehicule/[unit]/pixel-view.tsx`
- `app/vehicule/[unit]/walkaround-video.tsx`
- `app/embed/catalog/page.tsx`
- `app/inventaire/sync-wix-button.tsx`
- `app/inventaire/leads/page.tsx`
- `lib/wix/actions.ts`
- `lib/wix/client.ts`
- `lib/wix/config.ts`
- `lib/wix/sync.ts`
- `lib/leads/actions.ts`
- `lib/leads/admin-actions.ts`
- `lib/leads/schema.ts`
- `scripts/test-wix-sync.mjs`
- `scripts/test-lead.mjs`
- `docs/embed-wix.md`
- `docs/wix-integration.md`

**Interfaces:** Consumes none. Produces none.

- [ ] **Step 1: Delete catalogue, embed, wix, and leads trees.**
  Run:
  ```bash
  cd /home/hino1/pacman
  git rm -r app/vehicule app/embed lib/wix lib/leads \
    app/inventaire/sync-wix-button.tsx app/inventaire/leads \
    scripts/test-wix-sync.mjs scripts/test-lead.mjs \
    docs/embed-wix.md docs/wix-integration.md
  ```
  Expected: 19 `rm '...'` lines.

- [ ] **Step 2: Find references to the deleted catalogue/wix/leads modules.**
  Run:
  ```bash
  cd /home/hino1/pacman
  grep -rn -E "@/lib/wix|@/lib/leads|app/vehicule|app/embed|sync-wix|SyncWix|/inventaire/leads|lead-form|LeadForm|submitLead" \
    --include='*.ts' --include='*.tsx' --include='*.mjs' . | grep -v node_modules
  ```
  Remove every import/usage of a deleted module. Likely consumers: `app/sitemap.ts`
  (vehicule URLs), `app/app-header.tsx` (leads nav link), `app/page.tsx` /
  `app/catalog-views.tsx` if they link to `/vehicule/...`, and the LesPAC sync
  button row in `app/inventaire/page.tsx` (`sync-wix-button` import). Re-run the
  grep until only doc/comment hits remain.

- [ ] **Step 3: Typecheck.**
  Run:
  ```bash
  cd /home/hino1/pacman
  pnpm typecheck
  ```
  Expected: exit 0 (modulo deferred listings/serti coupling).

- [ ] **Step 4: Commit.**
  Run:
  ```bash
  cd /home/hino1/pacman
  git add -A
  git commit -m "$(cat <<'EOF'
chore: delete public catalogue, Wix embed/sync, and lead capture

Removes app/vehicule (public catalogue), app/embed (Wix iframe),
lib/wix, lib/leads, the leads admin page, and their scripts/docs.
The mirror bot has no public site and no on-site lead funnel.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
EOF
)"
  ```

---

### Task 5: Delete the channel / publication / bulk-publish layer

**Files (Delete):**
- `lib/listings/channel-state.ts`
- `lib/listings/publication.ts`
- `lib/listings/publication-jobs.ts`
- `lib/stats/channels.ts`
- `app/dashboard/publication-jobs/page.tsx`
- `app/inventaire/bulk-publish-button.tsx`
- `tests/unit/channels.test.ts`
- `tests/unit/publication.test.ts`

**Interfaces:** Consumes none. Produces none.

> Migrations (`20260429*` channel-state, `20260504120000_publication_ops`,
> `20260504190000`/`20260504191000` truckpaper/marketbook channels) are NOT
> deleted — they are applied to live Supabase. The columns they add become inert.

- [ ] **Step 1: Delete the channel/publication code and tests.**
  Run:
  ```bash
  cd /home/hino1/pacman
  git rm lib/listings/channel-state.ts lib/listings/publication.ts \
    lib/listings/publication-jobs.ts lib/stats/channels.ts \
    app/dashboard/publication-jobs/page.tsx app/inventaire/bulk-publish-button.tsx \
    tests/unit/channels.test.ts tests/unit/publication.test.ts
  ```
  Expected: 8 `rm '...'` lines.

- [ ] **Step 2: Find references to channels / publication / bulk-publish.**
  Run:
  ```bash
  cd /home/hino1/pacman
  grep -rn -E "channel-state|channelState|normalizeChannels|@/lib/stats/channels|publication-jobs|publicationJobs|@/lib/listings/publication\b|bulk-publish|BulkPublish|publication-jobs" \
    --include='*.ts' --include='*.tsx' --include='*.mjs' . | grep -v node_modules
  ```
  Remove every import/usage. Known consumers to clean: `app/inventaire/page.tsx`
  and `app/inventaire/inventaire-table.tsx` (bulk-publish button, channel chips),
  `app/dashboard/page.tsx` and `app/app-header.tsx` (publication-jobs nav/card),
  `lib/listings/schema.ts` (drop the `channels`/`normalizeChannels` export if it
  is now unused), `lib/lespac/import.ts` (imports `normalizeChannels` — strip
  that import; full `lib/lespac` rewrite is deferred). Re-run until only
  doc/comment hits remain.

- [ ] **Step 3: Typecheck.**
  Run:
  ```bash
  cd /home/hino1/pacman
  pnpm typecheck
  ```
  Expected: exit 0 once the consumers above are cleaned. Remaining errors should
  only be in `lib/lespac/*` or `lib/listings/*` that Task 6 deletes — note them.

- [ ] **Step 4: Commit.**
  Run:
  ```bash
  cd /home/hino1/pacman
  git add -A
  git commit -m "$(cat <<'EOF'
chore: delete channel toggles, publication jobs, and bulk publish

Removes the multi-channel publication layer (channel-state, publication,
publication-jobs, stats/channels) and its UI (publication-jobs dashboard,
bulk-publish button) plus tests. The bot reconciles state itself; channels
become a fixed driver set.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
EOF
)"
  ```

---

### Task 6: Delete all SERTI usage, scan-VIN, and the listing editor / photo manager

**Files (Delete):**
- `lib/serti/client.ts`
- `lib/serti/wgi.ts`
- `app/api/wgi/[vin]/route.ts`
- `app/inventaire/scan-vin/page.tsx`
- `app/inventaire/scan-vin/scan-vin-client.tsx`
- `app/inventaire/[unit]/listing-form.tsx`
- `app/inventaire/[unit]/photo-manager.tsx`
- `app/inventaire/[unit]/capture-mobile.tsx`
- `app/inventaire/[unit]/walkaround-video.tsx`
- `app/inventaire/[unit]/page.tsx`
- `app/inventaire/[unit]/pdf/page.tsx`
- `app/inventaire/[unit]/pdf/print-button.tsx`
- `app/capture/[token]/page.tsx`
- `app/capture/[token]/capture-client.tsx`
- `lib/photo-sessions/actions.ts`
- `tests/unit/serti.wgi.test.ts`

**Interfaces:** Consumes none. Produces none.

> This is the deepest cut. SERTI was the vehicle-identity source; removing it
> strands much of `lib/listings/*` (queries, public, display, mileage, photos,
> actions) and `lib/lespac/{import,mapping}.ts`. Delete the SERTI surface +
> editor UI here; fully untangling `lib/listings`/`lib/lespac` is the LesPAC-reader
> and dashboard plan sections. This task ENDS GREEN only after removing the
> now-dangling tracked consumers the grep surfaces.

- [ ] **Step 1: Remove `serverExternalPackages` for the native SERTI driver from `next.config.ts`.**
  Read `next.config.ts` and delete `node-jt400` / `java` from the
  `serverExternalPackages` array (and the array itself if it becomes empty). This
  must happen before deleting `lib/serti` so the build does not try to externalize
  a package nothing imports.

- [ ] **Step 2: Delete the SERTI lib, the WGI API route, scan-VIN, the listing editor, capture, and photo-sessions.**
  Run:
  ```bash
  cd /home/hino1/pacman
  git rm -r lib/serti app/api/wgi app/inventaire/scan-vin \
    app/inventaire/[unit] app/capture lib/photo-sessions/actions.ts \
    tests/unit/serti.wgi.test.ts
  ```
  Expected: 16 `rm '...'` lines (the `app/inventaire/[unit]` and `app/capture`
  recursions expand to the listed files).

- [ ] **Step 3: Uninstall the native SERTI dependencies.**
  Run:
  ```bash
  cd /home/hino1/pacman
  grep -nE "node-jt400|\"java\"" package.json
  ```
  If either appears under `dependencies`, run
  `pnpm remove node-jt400 java` (only the ones present). Expected: lockfile
  updates, no error.

- [ ] **Step 4: Find every remaining SERTI / WGI / scan / capture / photo-session reference.**
  Run:
  ```bash
  cd /home/hino1/pacman
  grep -rn -E "@/lib/serti|lib/serti|node-jt400|/api/wgi|SertiStatus|WGI|scan-vin|@/lib/photo-sessions|photo-session|app/inventaire/\[unit\]|/capture/" \
    --include='*.ts' --include='*.tsx' --include='*.mjs' . | grep -v node_modules
  ```
  Remove every import/usage. Confirmed consumers to fix or delete:
  `lib/lespac/mapping.ts` (imports `SertiStatus` from `@/lib/serti/wgi`),
  `lib/listings/queries.ts`, `lib/listings/public.ts`, `lib/listings/actions.ts`,
  `lib/stats/dashboard.ts`, `lib/stats/demand.ts`, `lib/lespac/import.ts`,
  `scripts/import-lespac-manual.mjs`, `scripts/seed-placeholder-photos.mjs`,
  `tests/unit/listings-queries.test.ts`, and any `app/inventaire/*` table/page
  that links to `[unit]`, `scan-vin`, or `/capture`. For each: if the module's
  sole purpose was SERTI/editor plumbing now orphaned, `git rm` it; otherwise
  strip the dead import. Re-run the grep until only doc/comment hits remain.

- [ ] **Step 5: Typecheck and full build to flush every dangling import.**
  Run:
  ```bash
  cd /home/hino1/pacman
  pnpm typecheck
  pnpm build
  ```
  Expected: both exit 0. `pnpm build` is the authoritative check that no route
  still imports a deleted module. Fix each reported missing-module error by
  removing the import or deleting the orphaned file, then re-run until green.

- [ ] **Step 6: Run the surviving test suite.**
  Run:
  ```bash
  cd /home/hino1/pacman
  pnpm test
  ```
  Expected: exit 0. If a test imports a deleted module (e.g.
  `tests/unit/listings-queries.test.ts`), delete that test file via `git rm` —
  the listings layer it covered is gone or being rewritten later.

- [ ] **Step 7: Commit.**
  Run:
  ```bash
  cd /home/hino1/pacman
  git add -A
  git commit -m "$(cat <<'EOF'
chore: delete all SERTI usage, scan-VIN, and the listing editor

Removes lib/serti (node-jt400/DB2 driver), the WGI API route, scan-VIN,
the per-unit listing form + photo manager + PDF + capture flow, and
photo-sessions. Drops node-jt400/java externals from next.config and
package deps. LesPAC is now the sole content source; SERTI cost exposure
is structurally impossible.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
EOF
)"
  ```

---

### Task 6b: Trim `lib/lespac` to the read client, delete `lib/listings` + the dead inventaire/import surface

> Resolves the coupling warning left by Tasks 5–6. Must run **before** Task 7's
> green gate — the tree cannot typecheck while these dangling imports remain.

**Files:**
- Delete: `lib/lespac/mapping.ts`, `lib/lespac/sync.ts`, `lib/lespac/import.ts`, `lib/lespac/actions.ts` (the LesPAC *write* path; they import deleted `lib/listings`/`lib/serti`)
- Delete: `lib/listings/` (entire directory — orphaned by the SERTI + catalogue cut, unused by the bot)
- Delete: `app/inventaire/import-lespac/` (`actions.ts`, `import-table.tsx`, `page.tsx`), `app/inventaire/sync-lespac-button.tsx`, and any remaining `app/inventaire/**` (the bot keeps no inventory UI; the only surviving app surface is login + `/dashboard/bot`)
- Keep: `lib/lespac/client.ts`, `lib/lespac/config.ts`, `lib/lespac/types.ts` (the read path the bot reader consumes — `client.ts` imports only `./config` + `./types`, so it is self-contained)

**Interfaces:** Consumes none. Produces a buildable tree whose only LesPAC surface is the read client.

**Steps:**

- [ ] **Step 1: Delete the LesPAC write path (keep the read client).**
  ```bash
  cd /home/hino1/pacman
  git rm lib/lespac/mapping.ts lib/lespac/sync.ts lib/lespac/import.ts lib/lespac/actions.ts
  ```

- [ ] **Step 2: Delete the orphaned listings layer.**
  ```bash
  git rm -r lib/listings
  ```

- [ ] **Step 3: Delete the LesPAC import/sync UI and any remaining inventaire surface.**
  ```bash
  git rm -r app/inventaire/import-lespac
  git rm app/inventaire/sync-lespac-button.tsx
  # Remove whatever inventaire pages remain (main list, table, status badges, etc.) —
  # the bot has no inventory UI:
  git ls-files 'app/inventaire/*' | xargs -r git rm
  ```

- [ ] **Step 4: Find and remove stragglers importing deleted modules.**
  ```bash
  grep -rlnE "@/lib/listings|@/lib/serti|lespac/(mapping|sync|import|actions)" app lib --include='*.ts' --include='*.tsx'
  ```
  For each file printed: if it is itself part of the cut (a dead page/component) `git rm` it; if it is a kept file, strip the dead import. Re-run until the grep prints nothing.

- [ ] **Step 5: Green gate.**
  ```bash
  pnpm typecheck && pnpm build
  ```
  Expected: both exit 0. The only `lib/lespac` files left are `client.ts`, `config.ts`, `types.ts`.

- [ ] **Step 6: Commit.**
  ```bash
  git add -A
  git commit -m "$(cat <<'EOF'
  refactor(lespac): trim to read client; drop listings + inventaire UI

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
  EOF
  )"
  ```

---

### Task 7: Verify the tree is green and the cut list is fully removed

**Files:** none.
**Interfaces:** Consumes none. Produces none.

- [ ] **Step 1: Assert no cut-list path survives.**
  Run:
  ```bash
  cd /home/hino1/pacman
  git ls-files | grep -E '^app/feed/|^lib/feeds/|^lib/google/|^lib/meta/|^app/dashboard/(google|meta)/|sandhills|^app/vehicule/|^app/embed/|^lib/wix/|^lib/leads/|sync-wix|^app/inventaire/leads/|channel-state|publication-jobs|^lib/listings/publication|bulk-publish|^lib/serti/|^app/api/wgi|scan-vin|^app/inventaire/\[unit\]/|^app/capture/|^lib/photo-sessions/' \
    || echo "CLEAN: no cut-list paths remain"
  ```
  Expected: `CLEAN: no cut-list paths remain`. Any printed path means a cluster
  task missed it — go back and `git rm` it before continuing.

- [ ] **Step 2: Final lint + typecheck + build + test gate.**
  Run:
  ```bash
  cd /home/hino1/pacman
  pnpm lint && pnpm typecheck && pnpm build && pnpm test
  ```
  Expected: all four exit 0. This is the green baseline the scaffolding (Task 8)
  and the bot engine sections build on.

- [ ] **Step 3: No commit.** Verification only. If a prior task left the tree red,
  amend that task's commit rather than committing a fixup here.

---

### Task 8: Scaffold the `lib/bot/` tree, the `worker/` entry, pm2 app, and bot scripts

**Files:**
- Create `lib/bot/.gitkeep` (placeholder for the driver/harness modules built later)
- Create `worker/.gitkeep` (placeholder for `worker/index.js` + `worker/run-once.js`)
- Create `scripts/.gitkeep` is NOT needed (`scripts/` already tracked)
- Create `sessions/.gitkeep` (placeholder for `sessions/<platform>.json`)
- Modify `ecosystem.config.cjs` (add the `pacman-bot` app)
- Modify `package.json` (add `bot`, `bot:login`, `bot:cycle` scripts)
- Modify `.gitignore` (ignore the session state files, keep the dir)

**Interfaces:** Consumes none. Produces the empty scaffolding consumed by the
LesPAC-reader, reconciler, driver, and worker plan sections.

- [ ] **Step 1: Create the placeholder directories.**
  Run:
  ```bash
  cd /home/hino1/pacman
  mkdir -p lib/bot worker sessions
  printf '%s\n' '# lib/bot — mirror-bot engine: harness, reconciler, drivers.' \
    'Populated by later plan sections. Placeholder keeps the dir under git.' > lib/bot/.gitkeep
  printf '%s\n' '# worker — pacman-bot process entry: index.js (scheduler) + run-once.js.' \
    'Populated by later plan sections. Placeholder keeps the dir under git.' > worker/.gitkeep
  printf '%s\n' '# sessions — Playwright storageState per platform (sessions/<platform>.json).' \
    'Files are gitignored; this placeholder keeps the dir present.' > sessions/.gitkeep
  ```
  Expected: three `.gitkeep` files created.

- [ ] **Step 2: Gitignore the saved session state (cookies = secrets) but keep the dir.**
  Edit `.gitignore`, appending:
  ```gitignore
  # Playwright saved login sessions (cookies — never commit)
  /sessions/*.json
  ```
  Verify with:
  ```bash
  cd /home/hino1/pacman
  git check-ignore sessions/facebook.json
  ```
  Expected: prints `sessions/facebook.json` (it is ignored).

- [ ] **Step 3: Add the `pacman-bot` app to `ecosystem.config.cjs`.**
  In `ecosystem.config.cjs`, insert this object into the `apps` array immediately
  after the existing `pacman` app object (keep the existing `pacman` app
  unchanged):
  ```js
      {
        name: "pacman-bot",
        script: "node",
        args: "worker/index.js",
        cwd: "/home/hino1/pacman",
        interpreter: "none",
        exec_mode: "fork",
        instances: 1,
        autorestart: true,
        max_restarts: 20,
        restart_delay: 5000,
        max_memory_restart: "1G",
        env: {
          NODE_ENV: "production",
          PATH: "/home/hino1/.npm-global/bin:/usr/local/bin:/usr/bin:/bin",
        },
        error_file: "/home/hino1/.pm2/logs/pacman-bot-error.log",
        out_file: "/home/hino1/.pm2/logs/pacman-bot-out.log",
        merge_logs: true,
        log_date_format: "YYYY-MM-DD HH:mm:ss",
      },
  ```
  Verify the file still parses:
  ```bash
  cd /home/hino1/pacman
  node -e "const c=require('./ecosystem.config.cjs'); console.log(c.apps.map(a=>a.name).join(','))"
  ```
  Expected: `pacman,pacman-bot`.

- [ ] **Step 4: Add the bot scripts to `package.json`.**
  In the `"scripts"` block, replace the two stale `assisted:draft` /
  `marketplace:draft` entries (they point at the now-stashed
  `scripts/facebook-marketplace-draft.mjs`) with the three bot scripts:
  ```json
      "bot": "node worker/index.js",
      "bot:login": "node scripts/bot-login.mjs",
      "bot:cycle": "node worker/run-once.js",
  ```
  Verify the JSON parses and the keys exist:
  ```bash
  cd /home/hino1/pacman
  node -e "const p=require('./package.json'); ['bot','bot:login','bot:cycle'].forEach(k=>{if(!p.scripts[k])throw new Error('missing '+k)}); console.log('ok', Object.keys(p.scripts).join(','))"
  ```
  Expected: `ok dev,build,start,lint,typecheck,test,bot,bot:login,bot:cycle,test:watch`
  (and NO `assisted:draft` / `marketplace:draft`).

- [ ] **Step 5: Install the Chromium browser binary for Playwright.**
  (`playwright` is already a devDependency — no `pnpm add` needed.)
  Run:
  ```bash
  cd /home/hino1/pacman
  pnpm exec playwright install chromium
  ```
  Expected: downloads/validates Chromium; ends with a success line (or "is already
  installed"). If the host is missing system libs, also run
  `pnpm exec playwright install-deps chromium` (may require sudo) and note it for
  the operator.

- [ ] **Step 6: Typecheck (scaffolding must not break the green baseline).**
  Run:
  ```bash
  cd /home/hino1/pacman
  pnpm typecheck
  ```
  Expected: exit 0. (Empty `.gitkeep` dirs and config edits introduce no TS.)

- [ ] **Step 7: Commit.**
  Run:
  ```bash
  cd /home/hino1/pacman
  git add -A
  git commit -m "$(cat <<'EOF'
chore: scaffold bot worker, pm2 app, and bot scripts

Adds empty lib/bot, worker, and sessions dirs (sessions/*.json
gitignored), a pacman-bot pm2 process (node worker/index.js), and
package scripts bot / bot:login / bot:cycle replacing the removed
assisted/marketplace draft scripts. Playwright Chromium installed.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
EOF
)"
  ```


# Phase B — Data & Engine

## Data + Engine layer (snapshot, hash, reader, schema)

This section builds the **persistence layer** for the LesPAC mirror bot and the
three pure/IO-thin engine modules the reconciler and drivers depend on:

- the 4 Supabase tables (`lespac_listing`, `platform_publication`, `bot_event`,
  `platform_session`) + their generated TS types,
- the locked shared contract file `lib/bot/types.ts`,
- `lib/bot/hash.ts` (content hashing),
- `lib/bot/lespac-reader.ts` (LesPAC API → `NormalizedListing[]`),
- `lib/bot/snapshot.ts` (snapshot upsert + gone-detection).

All modules are server-only, framework-free, and unit-tested with mocks (no
browser, no live DB). The `touch_updated_at()` trigger function already exists
globally (`supabase/migrations/20260422120100_touch_updated_at_search_path.sql`),
so the migration only attaches triggers — it does not redefine the function.

> **Locked contract — do not rename.** Other agents (drivers, reconciler,
> dashboard) import these exact names/paths. `lib/bot/types.ts` is **owned by
> this section** but only for the three types below; `Job`, `PlatformDriver`,
> `PublishResult`, and the error classes are appended to that same file by later
> tasks (drivers/reconciler), guarded by a placeholder comment so the two tasks
> never both create the file.

---

### Task 1 — DB migration: 4 mirror-bot tables

**Files:**
- Create: `supabase/migrations/20260622120000_lespac_mirror_bot.sql`

**Interfaces:**
- Consumes: existing `public.touch_updated_at()` trigger function.
- Produces: tables `public.lespac_listing`, `public.platform_publication`,
  `public.bot_event`, `public.platform_session` (consumed by Task 2 types,
  Task 6 snapshot, and every later reconciler/driver/dashboard task).

**Column contract (locked — other agents depend on these exact names):**

`lespac_listing`:
`lespac_id (PK text)` · `title text` · `price_cad numeric` ·
`description text` · `photo_urls text[]` · `content_hash text` ·
`status text ('active'|'gone')` · `first_seen timestamptz` ·
`last_seen timestamptz` · `raw jsonb` · `created_at timestamptz` ·
`updated_at timestamptz`

`platform_publication`:
`id uuid PK` · `lespac_id text FK→lespac_listing` ·
`platform text ('facebook'|'kijiji'|'autotrader')` ·
`status text ('pending'|'live'|'failed'|'removed')` ·
`external_url text` · `external_id text` · `published_hash text` ·
`last_action text ('create'|'update'|'remove')` · `attempt_count int` ·
`last_attempt_at timestamptz` · `last_success_at timestamptz` ·
`error_message text` · `created_at timestamptz` · `updated_at timestamptz` ·
`UNIQUE(lespac_id, platform)`

`bot_event` (append-only):
`id uuid PK` · `lespac_id text` · `platform text` · `action text` ·
`outcome text ('success'|'failure'|'skipped')` · `detail jsonb` ·
`screenshot_path text` · `created_at timestamptz`

`platform_session`:
`platform text PK ('facebook'|'kijiji'|'autotrader')` ·
`health text ('healthy'|'needs_reauth'|'unknown')` ·
`last_validated_at timestamptz` · `last_error text` ·
`created_at timestamptz` · `updated_at timestamptz`

**Steps:**

- [ ] Write the migration file with the FULL SQL below (no placeholders):

```sql
-- LesPAC mirror bot — persistence layer.
-- Anchored on the LesPAC listing id (text), NOT SERTI unit#.
-- All tables admin-only: authenticated full access, anon = no policy.
-- touch_updated_at() already exists globally (20260422120100).

-- ── lespac_listing ──────────────────────────────────────────────
-- Lightweight snapshot of the dealer's active LesPAC listings,
-- refreshed each sync cycle. Absent from a pull → status='gone' (sold).
CREATE TABLE IF NOT EXISTS public.lespac_listing (
  lespac_id     text PRIMARY KEY,
  title         text NOT NULL DEFAULT '',
  price_cad     numeric,
  description   text NOT NULL DEFAULT '',
  photo_urls    text[] NOT NULL DEFAULT ARRAY[]::text[],
  content_hash  text NOT NULL,
  status        text NOT NULL DEFAULT 'active',
  first_seen    timestamptz NOT NULL DEFAULT now(),
  last_seen     timestamptz NOT NULL DEFAULT now(),
  raw           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lespac_listing_status_valid
    CHECK (status IN ('active','gone'))
);

CREATE INDEX IF NOT EXISTS lespac_listing_status_idx
  ON public.lespac_listing(status, last_seen DESC);

ALTER TABLE public.lespac_listing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lespac_listing_auth_all ON public.lespac_listing;
CREATE POLICY lespac_listing_auth_all ON public.lespac_listing
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS lespac_listing_touch ON public.lespac_listing;
CREATE TRIGGER lespac_listing_touch
  BEFORE UPDATE ON public.lespac_listing
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── platform_publication ────────────────────────────────────────
-- The mirror state: per (lespac_id, platform) memory that makes the
-- reconciler idempotent. published_hash ≠ lespac_listing.content_hash
-- ⇒ UPDATE due.
CREATE TABLE IF NOT EXISTS public.platform_publication (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lespac_id        text NOT NULL
                     REFERENCES public.lespac_listing(lespac_id)
                     ON DELETE CASCADE,
  platform         text NOT NULL,
  status           text NOT NULL DEFAULT 'pending',
  external_url     text,
  external_id      text,
  published_hash   text,
  last_action      text,
  attempt_count    int NOT NULL DEFAULT 0,
  last_attempt_at  timestamptz,
  last_success_at  timestamptz,
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_publication_platform_valid
    CHECK (platform IN ('facebook','kijiji','autotrader')),
  CONSTRAINT platform_publication_status_valid
    CHECK (status IN ('pending','live','failed','removed')),
  CONSTRAINT platform_publication_last_action_valid
    CHECK (last_action IS NULL OR last_action IN ('create','update','remove')),
  CONSTRAINT platform_publication_unique_per_platform
    UNIQUE (lespac_id, platform)
);

CREATE INDEX IF NOT EXISTS platform_publication_platform_status_idx
  ON public.platform_publication(platform, status);

CREATE INDEX IF NOT EXISTS platform_publication_lespac_id_idx
  ON public.platform_publication(lespac_id);

ALTER TABLE public.platform_publication ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_publication_auth_all ON public.platform_publication;
CREATE POLICY platform_publication_auth_all ON public.platform_publication
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS platform_publication_touch ON public.platform_publication;
CREATE TRIGGER platform_publication_touch
  BEFORE UPDATE ON public.platform_publication
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── bot_event ───────────────────────────────────────────────────
-- Append-only history. Powers the dashboard timeline and alert dedup.
-- No updated_at / no touch trigger: rows are never updated.
CREATE TABLE IF NOT EXISTS public.bot_event (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lespac_id        text,
  platform         text,
  action           text NOT NULL,
  outcome          text NOT NULL,
  detail           jsonb NOT NULL DEFAULT '{}'::jsonb,
  screenshot_path  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bot_event_platform_valid
    CHECK (platform IS NULL OR platform IN ('facebook','kijiji','autotrader')),
  CONSTRAINT bot_event_outcome_valid
    CHECK (outcome IN ('success','failure','skipped','sent'))
);

CREATE INDEX IF NOT EXISTS bot_event_created_at_idx
  ON public.bot_event(created_at DESC);

CREATE INDEX IF NOT EXISTS bot_event_lespac_platform_idx
  ON public.bot_event(lespac_id, platform, created_at DESC);

ALTER TABLE public.bot_event ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bot_event_auth_all ON public.bot_event;
CREATE POLICY bot_event_auth_all ON public.bot_event
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── platform_session ────────────────────────────────────────────
-- Session health for the dashboard banner. One row per platform.
CREATE TABLE IF NOT EXISTS public.platform_session (
  platform           text PRIMARY KEY,
  health             text NOT NULL DEFAULT 'unknown',
  last_validated_at  timestamptz,
  last_error         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_session_platform_valid
    CHECK (platform IN ('facebook','kijiji','autotrader')),
  CONSTRAINT platform_session_health_valid
    CHECK (health IN ('healthy','needs_reauth','unknown'))
);

ALTER TABLE public.platform_session ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_session_auth_all ON public.platform_session;
CREATE POLICY platform_session_auth_all ON public.platform_session
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS platform_session_touch ON public.platform_session;
CREATE TRIGGER platform_session_touch
  BEFORE UPDATE ON public.platform_session
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
```

- [ ] Apply the migration locally / against the dev project (MCP
  `apply_migration` or `supabase db push`, per AGENTS.md dev workflow).
- [ ] Verify the 4 tables exist with RLS enabled and no `anon` policy
  (MCP `list_tables` or `\d+ public.platform_publication` in psql).
- [ ] Commit.

```
feat(bot): add lespac mirror bot persistence tables

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
```

---

### Task 2 — Generated Supabase TS types for the 4 tables

**Files:**
- Modify: `lib/supabase/types.ts`

**Interfaces:**
- Consumes: the 4 tables from Task 1.
- Produces: `Database["public"]["Tables"]` entries used by `createAdminClient<Database>()`
  everywhere the bot reads/writes Supabase.

The file is alphabetised by table name inside `Tables`. Insert the four entries
in alphabetical order: `bot_event` (after `app_user`), `lespac_listing` (after
`lead`), `platform_publication` and `platform_session` (after `photo_session`,
before `publication_job`). If you regenerate via MCP
`generate_typescript_types` the ordering is automatic; otherwise add by hand to
match the existing shape exactly (Row required, Insert/Update with `?` on
defaulted/nullable columns, `Relationships: []` except the FK on
`platform_publication`).

**Steps:**

- [ ] Add the `bot_event` block (after `app_user`, before `lead`):

```ts
      bot_event: {
        Row: {
          action: string;
          created_at: string;
          detail: Json;
          id: string;
          lespac_id: string | null;
          outcome: string;
          platform: string | null;
          screenshot_path: string | null;
        };
        Insert: {
          action: string;
          created_at?: string;
          detail?: Json;
          id?: string;
          lespac_id?: string | null;
          outcome: string;
          platform?: string | null;
          screenshot_path?: string | null;
        };
        Update: {
          action?: string;
          created_at?: string;
          detail?: Json;
          id?: string;
          lespac_id?: string | null;
          outcome?: string;
          platform?: string | null;
          screenshot_path?: string | null;
        };
        Relationships: [];
      };
```

- [ ] Add the `lespac_listing` block (after `lead`, before `listing`):

```ts
      lespac_listing: {
        Row: {
          content_hash: string;
          created_at: string;
          description: string;
          first_seen: string;
          last_seen: string;
          lespac_id: string;
          photo_urls: string[];
          price_cad: number | null;
          raw: Json;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          content_hash: string;
          created_at?: string;
          description?: string;
          first_seen?: string;
          last_seen?: string;
          lespac_id: string;
          photo_urls?: string[];
          price_cad?: number | null;
          raw?: Json;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Update: {
          content_hash?: string;
          created_at?: string;
          description?: string;
          first_seen?: string;
          last_seen?: string;
          lespac_id?: string;
          photo_urls?: string[];
          price_cad?: number | null;
          raw?: Json;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
```

- [ ] Add the `platform_publication` block (after `photo_session`, before `publication_job`):

```ts
      platform_publication: {
        Row: {
          attempt_count: number;
          created_at: string;
          error_message: string | null;
          external_id: string | null;
          external_url: string | null;
          id: string;
          last_action: string | null;
          last_attempt_at: string | null;
          last_success_at: string | null;
          lespac_id: string;
          platform: string;
          published_hash: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempt_count?: number;
          created_at?: string;
          error_message?: string | null;
          external_id?: string | null;
          external_url?: string | null;
          id?: string;
          last_action?: string | null;
          last_attempt_at?: string | null;
          last_success_at?: string | null;
          lespac_id: string;
          platform: string;
          published_hash?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempt_count?: number;
          created_at?: string;
          error_message?: string | null;
          external_id?: string | null;
          external_url?: string | null;
          id?: string;
          last_action?: string | null;
          last_attempt_at?: string | null;
          last_success_at?: string | null;
          lespac_id?: string;
          platform?: string;
          published_hash?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_publication_lespac_id_fkey";
            columns: ["lespac_id"];
            isOneToOne: false;
            referencedRelation: "lespac_listing";
            referencedColumns: ["lespac_id"];
          },
        ];
      };
```

- [ ] Add the `platform_session` block (immediately after `platform_publication`):

```ts
      platform_session: {
        Row: {
          created_at: string;
          health: string;
          last_error: string | null;
          last_validated_at: string | null;
          platform: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          health?: string;
          last_error?: string | null;
          last_validated_at?: string | null;
          platform: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          health?: string;
          last_error?: string | null;
          last_validated_at?: string | null;
          platform?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
```

- [ ] `pnpm exec tsc --noEmit` (typecheck) passes.
- [ ] Commit.

```
feat(bot): add generated supabase types for mirror bot tables

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
```

---

### Task 3 — Shared contract file `lib/bot/types.ts`

**Files:**
- Create: `lib/bot/types.ts`

**Interfaces:**
- Produces (locked, imported by hash/reader/snapshot and every later task):
  - `export type Platform = "facebook" | "kijiji" | "autotrader";`
  - `export interface NormalizedListing { lespacId: string; title: string; priceCad: number | null; description: string; photoUrls: string[]; }`
  - `export interface MirrorListing extends NormalizedListing { contentHash: string; }`
  - `export interface PublishResult { externalId: string; url: string; }`

This file is the single owner of the shared bot vocabulary. To avoid two tasks
both *creating* the file, **this task creates it with the four locked
declarations plus a placeholder comment**; the drivers and reconciler tasks
*append* (`Edit`, never rewrite) `Job`, `PlatformDriver`, and the error classes
below that comment.

**Steps:**

- [ ] Create `lib/bot/types.ts` with exactly:

```ts
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
```

- [ ] `pnpm exec tsc --noEmit` passes.
- [ ] Commit.

```
feat(bot): add shared mirror bot type contract

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
```

---

### Task 4 — `lib/bot/hash.ts` (content hashing, TDD)

**Files:**
- Create: `lib/bot/hash.ts`
- Test: `tests/unit/bot-hash.test.ts`

**Interfaces:**
- Consumes: `NormalizedListing` from `@/lib/bot/types`; node `crypto`.
- Produces: `export function computeContentHash(l: NormalizedListing): string`
  — sha256 hex over `{ title, priceCad, description, photoUrls }` where
  `photoUrls` is **sorted** so photo order is irrelevant. Consumed by
  `snapshot.refreshSnapshot` and the reconciler's UPDATE-detection.

**Steps:**

- [ ] Write the failing test `tests/unit/bot-hash.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeContentHash } from "@/lib/bot/hash";
import type { NormalizedListing } from "@/lib/bot/types";

const base = (overrides: Partial<NormalizedListing> = {}): NormalizedListing => ({
  lespacId: "12345",
  title: "2020 Hino 195",
  priceCad: 50000,
  description: "Bon camion",
  photoUrls: ["https://img/a.jpg", "https://img/b.jpg"],
  ...overrides,
});

describe("computeContentHash", () => {
  it("returns a 64-char sha256 hex string", () => {
    expect(computeContentHash(base())).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for identical content", () => {
    expect(computeContentHash(base())).toBe(computeContentHash(base()));
  });

  it("ignores lespacId (only published fields matter)", () => {
    expect(computeContentHash(base({ lespacId: "999" }))).toBe(
      computeContentHash(base()),
    );
  });

  it("changes when price changes", () => {
    expect(computeContentHash(base({ priceCad: 49000 }))).not.toBe(
      computeContentHash(base()),
    );
  });

  it("changes when title or description changes", () => {
    expect(computeContentHash(base({ title: "Other" }))).not.toBe(
      computeContentHash(base()),
    );
    expect(computeContentHash(base({ description: "Other" }))).not.toBe(
      computeContentHash(base()),
    );
  });

  it("is independent of photo order", () => {
    const a = computeContentHash(base({ photoUrls: ["x", "y", "z"] }));
    const b = computeContentHash(base({ photoUrls: ["z", "x", "y"] }));
    expect(a).toBe(b);
  });

  it("distinguishes a null price from a zero price", () => {
    expect(computeContentHash(base({ priceCad: null }))).not.toBe(
      computeContentHash(base({ priceCad: 0 })),
    );
  });
});
```

- [ ] Run `pnpm exec vitest run tests/unit/bot-hash.test.ts` — expect FAIL
  (module not found / function undefined).

- [ ] Implement `lib/bot/hash.ts`:

```ts
import { createHash } from "node:crypto";
import type { NormalizedListing } from "@/lib/bot/types";

/**
 * Stable sha256 (hex) over the fields we actually publish: title, price,
 * description, and the set of photo URLs (order-independent — sorted before
 * hashing). lespacId is deliberately excluded: it identifies the listing, it
 * is not published content. A change in this hash means the mirror needs an
 * UPDATE.
 */
export function computeContentHash(l: NormalizedListing): string {
  const canonical = JSON.stringify({
    title: l.title,
    priceCad: l.priceCad,
    description: l.description,
    photoUrls: [...l.photoUrls].sort(),
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
```

- [ ] Run `pnpm exec vitest run tests/unit/bot-hash.test.ts` — expect PASS.
- [ ] Commit.

```
feat(bot): add content hashing for mirror change detection

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
```

---

### Task 5 — `lib/bot/lespac-reader.ts` (LesPAC → NormalizedListing[], TDD)

**Files:**
- Create: `lib/bot/lespac-reader.ts`
- Test: `tests/unit/bot-lespac-reader.test.ts`

**Interfaces:**
- Consumes: existing LesPAC client `@/lib/lespac/client` (`listAll()` →
  `LespacListingSummary[]`, `getByListingId(id)` → `LespacListing | null`);
  `NormalizedListing` from `@/lib/bot/types`.
- Produces: `export async function fetchActiveListings(): Promise<NormalizedListing[]>`.
  Consumed by `snapshot.refreshSnapshot` and the sync loop.

**Design notes (from the real client):**
- `listAll()` returns summaries (id/vendorId/title/state/status) — enough to
  filter, not enough to publish. Only `status === "ONLINE"` summaries are the
  dealer's active listings; `PENDING`/`DEACTIVATED` are skipped.
- Full content (description, price, `imageURLs`) lives on the per-listing
  `getByListingId(listingId)` detail. The reader fetches detail per active
  summary and maps it.
- `lespacId` = `String(summary.listingId)`. Map `price → priceCad`
  (`?? null`), `description ?? ""`, `imageURLs ?? []`. A detail that comes back
  `null` (404 race) is skipped — never emit a half-listing.

**Steps:**

- [ ] Write the failing test `tests/unit/bot-lespac-reader.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  LespacListing,
  LespacListingSummary,
} from "@/lib/lespac/types";

const listAll = vi.fn();
const getByListingId = vi.fn();

vi.mock("@/lib/lespac/client", () => ({
  listAll: (...a: unknown[]) => listAll(...a),
  getByListingId: (...a: unknown[]) => getByListingId(...a),
}));

import { fetchActiveListings } from "@/lib/bot/lespac-reader";

const summary = (o: Partial<LespacListingSummary>): LespacListingSummary => ({
  listingId: 101,
  vendorId: "U1",
  title: "2020 Hino 195",
  state: "USED",
  status: "ONLINE",
  ...o,
});

const detail = (o: Partial<LespacListing>): LespacListing =>
  ({
    listingId: 101,
    vendorId: "U1",
    category: "Véhicules - Camions",
    title: "2020 Hino 195",
    description: "Bon camion",
    price: 50000,
    postalCode: "G6V 0A1",
    contact: {
      type: "STANDARD",
      emailAddress: "x@y.ca",
      firstName: "A",
      lastName: "B",
    },
    status: "ONLINE",
    imageURLs: ["https://img/a.jpg", "https://img/b.jpg"],
    ...o,
  }) as LespacListing;

beforeEach(() => {
  listAll.mockReset();
  getByListingId.mockReset();
});

describe("fetchActiveListings", () => {
  it("maps ONLINE listings to NormalizedListing", async () => {
    listAll.mockResolvedValue([summary({})]);
    getByListingId.mockResolvedValue(detail({}));

    const out = await fetchActiveListings();

    expect(out).toEqual([
      {
        lespacId: "101",
        title: "2020 Hino 195",
        priceCad: 50000,
        description: "Bon camion",
        photoUrls: ["https://img/a.jpg", "https://img/b.jpg"],
      },
    ]);
    expect(getByListingId).toHaveBeenCalledWith(101);
  });

  it("skips listings that are not ONLINE", async () => {
    listAll.mockResolvedValue([
      summary({ listingId: 1, status: "PENDING" }),
      summary({ listingId: 2, status: "DEACTIVATED" }),
      summary({ listingId: 3, status: "ONLINE" }),
    ]);
    getByListingId.mockResolvedValue(detail({ listingId: 3 }));

    const out = await fetchActiveListings();

    expect(out.map((l) => l.lespacId)).toEqual(["3"]);
    expect(getByListingId).toHaveBeenCalledTimes(1);
    expect(getByListingId).toHaveBeenCalledWith(3);
  });

  it("coerces missing price/description/photos to null/empty", async () => {
    listAll.mockResolvedValue([summary({})]);
    getByListingId.mockResolvedValue(
      detail({ price: null, description: null, imageURLs: undefined }),
    );

    const [out] = await fetchActiveListings();

    expect(out.priceCad).toBeNull();
    expect(out.description).toBe("");
    expect(out.photoUrls).toEqual([]);
  });

  it("skips a listing whose detail comes back null (404 race)", async () => {
    listAll.mockResolvedValue([summary({ listingId: 7 })]);
    getByListingId.mockResolvedValue(null);

    expect(await fetchActiveListings()).toEqual([]);
  });
});
```

- [ ] Run `pnpm exec vitest run tests/unit/bot-lespac-reader.test.ts` — expect FAIL.

- [ ] Implement `lib/bot/lespac-reader.ts`:

```ts
import { getByListingId, listAll } from "@/lib/lespac/client";
import type { NormalizedListing } from "@/lib/bot/types";

/**
 * Pull the dealer's currently active LesPAC listings and reduce each to the
 * fields we mirror. Only ONLINE listings are returned; the full content
 * (description, price, photos) is fetched from the per-listing detail.
 * `lespacId` is the LesPAC listing id as a string.
 */
export async function fetchActiveListings(): Promise<NormalizedListing[]> {
  const summaries = await listAll();
  const active = summaries.filter((s) => s.status === "ONLINE");

  const out: NormalizedListing[] = [];
  for (const s of active) {
    const detail = await getByListingId(s.listingId);
    if (!detail) continue; // 404 race — never emit a half-listing
    out.push({
      lespacId: String(s.listingId),
      title: detail.title,
      priceCad: detail.price ?? null,
      description: detail.description ?? "",
      photoUrls: detail.imageURLs ?? [],
    });
  }
  return out;
}
```

- [ ] Run `pnpm exec vitest run tests/unit/bot-lespac-reader.test.ts` — expect PASS.
- [ ] Commit.

```
feat(bot): read active lespac listings into normalized form

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
```

---

### Task 6 — `lib/bot/snapshot.ts` (snapshot upsert + gone-detection, TDD)

**Files:**
- Create: `lib/bot/snapshot.ts`
- Test: `tests/unit/bot-snapshot.test.ts`

**Interfaces:**
- Consumes: `NormalizedListing` (`@/lib/bot/types`), `computeContentHash`
  (`@/lib/bot/hash`), a `SupabaseClient<Database>` against table
  `lespac_listing`.
- Produces:
  - `export interface SnapshotRow { lespacId: string; contentHash: string; status: "active" | "gone"; }`
  - `export async function refreshSnapshot(supabase: SupabaseClient, listings: NormalizedListing[]): Promise<SnapshotRow[]>`

**Behaviour (spec §sync loop step 2):**
1. For each listing: upsert into `lespac_listing` (PK `lespac_id`) with
   `status='active'`, recomputed `content_hash`, refreshed `last_seen=now()`,
   and the published fields. Upsert is one `.upsert([...], { onConflict: "lespac_id" })`.
2. Gone-detection: any row currently `status='active'` whose `lespac_id` is
   **not** in this pull is flipped to `status='gone'`. Implemented as a single
   `.update({ status: 'gone' }).eq('status','active').not('lespac_id','in',(ids))`
   — or, when the pull is empty, flip all active rows.
3. Return every current row (`select lespac_id, content_hash, status`) mapped to
   `SnapshotRow[]`.

**Steps:**

- [ ] Write the failing test `tests/unit/bot-snapshot.test.ts` (hand-rolled
  Supabase query-builder mock, matching the project's mocking style):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { NormalizedListing } from "@/lib/bot/types";
import { refreshSnapshot } from "@/lib/bot/snapshot";

const upsert = vi.fn();
const goneUpdate = vi.fn();
const selectRows = vi.fn();

// A chainable builder: from('lespac_listing') returns an object whose methods
// record calls and resolve to { data, error }.
function makeClient(): SupabaseClient<Database> {
  const updateChain = {
    update: (patch: unknown) => {
      goneUpdate(patch);
      return updateChain;
    },
    eq: () => updateChain,
    not: (col: string, op: string, val: unknown) => {
      goneUpdate.mock.results; // touch
      goneUpdate(`not:${col}:${op}`, val);
      return Promise.resolve({ data: null, error: null });
    },
  };
  const builder = {
    upsert: (rows: unknown, opts: unknown) => {
      upsert(rows, opts);
      return Promise.resolve({ data: null, error: null });
    },
    update: updateChain.update,
    eq: updateChain.eq,
    not: updateChain.not,
    select: () => Promise.resolve(selectRows()),
  };
  return { from: () => builder } as unknown as SupabaseClient<Database>;
}

const listing = (o: Partial<NormalizedListing>): NormalizedListing => ({
  lespacId: "1",
  title: "T",
  priceCad: 100,
  description: "D",
  photoUrls: ["a", "b"],
  ...o,
});

beforeEach(() => {
  upsert.mockReset();
  goneUpdate.mockReset();
  selectRows.mockReset();
  selectRows.mockReturnValue({
    data: [{ lespac_id: "1", content_hash: "h1", status: "active" }],
    error: null,
  });
});

describe("refreshSnapshot", () => {
  it("upserts each listing with a content_hash and active status", async () => {
    const client = makeClient();
    await refreshSnapshot(client, [listing({ lespacId: "1" })]);

    expect(upsert).toHaveBeenCalledTimes(1);
    const [rows, opts] = upsert.mock.calls[0];
    expect((opts as { onConflict: string }).onConflict).toBe("lespac_id");
    const row = (rows as Record<string, unknown>[])[0];
    expect(row.lespac_id).toBe("1");
    expect(row.status).toBe("active");
    expect(typeof row.content_hash).toBe("string");
    expect((row.content_hash as string).length).toBe(64);
    expect(row).toHaveProperty("last_seen");
  });

  it("flips previously-active rows absent from the pull to gone", async () => {
    const client = makeClient();
    await refreshSnapshot(client, [listing({ lespacId: "1" })]);

    // gone-update was issued with status:'gone' and an exclusion of the
    // present ids.
    const patches = goneUpdate.mock.calls.map((c) => c[0]);
    expect(patches).toContainEqual({ status: "gone" });
    expect(
      goneUpdate.mock.calls.some(
        (c) => typeof c[0] === "string" && c[0].startsWith("not:lespac_id"),
      ),
    ).toBe(true);
  });

  it("returns current rows as SnapshotRow[]", async () => {
    const client = makeClient();
    const out = await refreshSnapshot(client, [listing({ lespacId: "1" })]);
    expect(out).toEqual([
      { lespacId: "1", contentHash: "h1", status: "active" },
    ]);
  });

  it("flips ALL active rows gone when the pull is empty", async () => {
    const client = makeClient();
    await refreshSnapshot(client, []);
    expect(upsert).not.toHaveBeenCalled();
    expect(goneUpdate.mock.calls.map((c) => c[0])).toContainEqual({
      status: "gone",
    });
  });
});
```

- [ ] Run `pnpm exec vitest run tests/unit/bot-snapshot.test.ts` — expect FAIL.

- [ ] Implement `lib/bot/snapshot.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { NormalizedListing } from "@/lib/bot/types";
import { computeContentHash } from "@/lib/bot/hash";

export interface SnapshotRow {
  lespacId: string;
  contentHash: string;
  status: "active" | "gone";
}

/**
 * Refresh the lespac_listing snapshot for one sync cycle (spec §sync loop
 * step 2):
 *  1. upsert every pulled listing as status='active' with a recomputed
 *     content_hash and refreshed last_seen,
 *  2. flip any previously-active row absent from the pull to status='gone',
 *  3. return all current rows as SnapshotRow[].
 */
export async function refreshSnapshot(
  supabase: SupabaseClient<Database>,
  listings: NormalizedListing[],
): Promise<SnapshotRow[]> {
  const now = new Date().toISOString();
  const presentIds = listings.map((l) => l.lespacId);

  if (listings.length > 0) {
    const rows = listings.map((l) => ({
      lespac_id: l.lespacId,
      title: l.title,
      price_cad: l.priceCad,
      description: l.description,
      photo_urls: l.photoUrls,
      content_hash: computeContentHash(l),
      status: "active" as const,
      last_seen: now,
    }));
    const { error } = await supabase
      .from("lespac_listing")
      .upsert(rows, { onConflict: "lespac_id" });
    if (error) throw new Error(`snapshot upsert failed: ${error.message}`);
  }

  // Gone-detection: active rows not in this pull → 'gone'.
  let goneQuery = supabase
    .from("lespac_listing")
    .update({ status: "gone" })
    .eq("status", "active");
  if (presentIds.length > 0) {
    goneQuery = goneQuery.not(
      "lespac_id",
      "in",
      `(${presentIds.map((id) => `"${id}"`).join(",")})`,
    );
  }
  const { error: goneError } = await goneQuery;
  if (goneError) throw new Error(`snapshot gone-update failed: ${goneError.message}`);

  const { data, error: selError } = await supabase
    .from("lespac_listing")
    .select("lespac_id, content_hash, status");
  if (selError) throw new Error(`snapshot select failed: ${selError.message}`);

  return (data ?? []).map((r) => ({
    lespacId: r.lespac_id,
    contentHash: r.content_hash,
    status: r.status as "active" | "gone",
  }));
}
```

> **Note on the PostgREST `in` filter:** values are wrapped in an
> `("v1","v2")` list string, which safely handles numeric-looking ids. If a
> later integration test against a real PostgREST instance reveals quoting
> issues, switch to building the filter via `.in()` on a NOT by selecting the
> complementary set — but the unit contract above is the locked surface.

- [ ] Run `pnpm exec vitest run tests/unit/bot-snapshot.test.ts` — expect PASS.
- [ ] Run the full bot suite green:
  `pnpm exec vitest run tests/unit/bot-hash.test.ts tests/unit/bot-lespac-reader.test.ts tests/unit/bot-snapshot.test.ts`.
- [ ] `pnpm exec tsc --noEmit` passes.
- [ ] Commit.

```
feat(bot): add snapshot refresh with gone-detection

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
```


# Phase C — Reconciler & Mirror State

## Part 03 — Reconciler + Mirror State (pure core)

This is the highest-value, purely-testable core of the mirror bot: the **reconciler**
(pure diff function that turns a LesPAC snapshot + stored mirror state into a list of
per-platform jobs) and the **mirror-state** persistence layer (`loadPublications` /
`recordResult`). The reconciler does **zero I/O** and is exhaustively unit-tested; the
mirror-state layer is tested against a mocked Supabase client.

### Locked contracts consumed from other parts

```ts
// lib/bot/types.ts (existing, from earlier parts):
export type Platform = "facebook" | "kijiji" | "autotrader";
export interface NormalizedListing {
  lespacId: string; title: string; priceCad: number | null;
  description: string; photoUrls: string[];
}
export interface MirrorListing extends NormalizedListing { contentHash: string; }

// lib/bot/snapshot.ts (existing, from earlier parts):
export interface SnapshotRow {
  lespacId: string; contentHash: string; status: "active" | "gone";
}
```

### Mirror-state DB table (owned by the migration part; referenced here)

`platform_publication` columns this part reads/writes
(`UNIQUE(lespac_id, platform)`):

| column            | maps to `PublicationRow` field |
| ----------------- | ------------------------------ |
| `lespac_id`       | `lespacId`                     |
| `platform`        | `platform`                     |
| `status`          | `status`                       |
| `external_url`    | `externalUrl`                  |
| `external_id`     | `externalId`                   |
| `published_hash`  | `publishedHash`                |
| `attempt_count`   | `attemptCount`                 |
| `last_action`     | (written by `recordResult`)    |
| `error_message`   | (written by `recordResult`)    |
| `last_attempt_at` | (written by `recordResult`)    |
| `last_success_at` | (written by `recordResult`)    |

---

## The `buildJobs` rule table (authoritative)

`buildJobs` iterates **enabled platforms × snapshot rows**, plus a pass over `gone`
rows. For a given `(snapshot.status, publication.status)` pair it emits exactly:

| snapshot.status | publication for (lespacId, platform) | emitted job                                                              |
| --------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| `active`        | **none** (no row)                    | **CREATE** (`listing` set, `externalId=null`)                            |
| `active`        | `removed`                            | **CREATE** — re-create; the ad was taken down but the unit is for sale   |
| `active`        | `failed`                             | **CREATE** — re-attempt next cycle (a `failed` pub never went `live`)    |
| `active`        | `pending`                            | **nothing** — a job is in flight; skip to stay idempotent                |
| `active`        | `live`, `publishedHash === content`  | **nothing** — already mirrored and up to date (idempotent)               |
| `active`        | `live`, `publishedHash !== content`  | **UPDATE** (`listing` set, `externalId=pub.externalId`)                  |
| `gone`          | `live`                               | **REMOVE** (`listing=null`, `externalId=pub.externalId`)                 |
| `gone`          | `pending`                            | **nothing** — in flight; the next cycle re-evaluates once it settles     |
| `gone`          | `failed` / `removed`                 | **nothing** — nothing live to take down                                  |
| `gone`          | **none** (no row)                    | **nothing** — never mirrored                                             |

**Decisions documented (and individually tested):**

- **`failed` on an active listing → re-CREATE.** A `failed` publication never reached
  `live` (a live ad that later fails is recorded as `live` with an `error_message`, not
  `failed`; per the driver contract `failed` means the create/update attempt itself did
  not produce a live ad). So the safe action is to try creating again. Retry-count
  capping (stop after N attempts) is a **harness/scheduler** concern, not the
  reconciler's — `buildJobs` stays pure and always proposes the create; the executor
  consults `attemptCount` before running. This keeps the reconciler deterministic.
- **`pending` → skip, always.** `pending` means a job for that `(lespacId, platform)`
  is mid-flight (or crashed mid-flight). Re-emitting would risk a double-post. The
  crash-ambiguous case is handled by the harness's pre-CREATE existence check + operator
  flag (spec §Crash-safe), never by the reconciler silently re-posting.
- **`removed` on an active listing → re-CREATE.** If the unit reappears as active on
  LesPAC after we removed it (relisted), we re-mirror it.
- **UPDATE keys on hash inequality only.** Equality ⇒ no job. This is the idempotency
  guarantee: running `buildJobs` twice against an up-to-date mirror yields `[]`.

`buildJobs` is order-deterministic: it iterates `enabled` in the given order, and within
each platform iterates `snapshot` in array order; the `gone`/REMOVE pass runs after the
active pass. Tests assert exact array contents and ordering.

---

### Task 1 — Append `JobAction` + `Job` to `lib/bot/types.ts`

Folded into Task 2's first commit (it is a 6-line append and the reconciler test imports
it), but specified separately for clarity.

**Files**
- Modify: `lib/bot/types.ts`

**Interfaces**
- Produces:
  ```ts
  export type JobAction = "create" | "update" | "remove";
  export interface Job {
    action: JobAction;
    platform: Platform;
    lespacId: string;
    listing: MirrorListing | null; // set for create/update, null for remove
    externalId: string | null;     // set for update/remove, null for create
  }
  ```

**Steps**

- [ ] Append to the end of `lib/bot/types.ts` (after the existing `MirrorListing`
  declaration; do not rename or reorder existing exports):
  ```ts
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
  ```
- [ ] Typecheck: `pnpm exec tsc --noEmit`
  Expect: PASS (pure type addition).

(No standalone commit — committed together with Task 2.)

---

### Task 2 — `lib/bot/reconciler.ts` `buildJobs(...)` (pure, exhaustively tested)

**Files**
- Create: `lib/bot/reconciler.ts`
- Test: `tests/unit/bot-reconciler.test.ts`
- (Modify `lib/bot/types.ts` from Task 1 lands in this commit.)

**Interfaces**
- Consumes:
  ```ts
  import type { SnapshotRow } from "@/lib/bot/snapshot";
  import type { MirrorListing, Platform } from "@/lib/bot/types";
  import type { PublicationRow } from "@/lib/bot/mirror-state";
  ```
  (The `PublicationRow` import is type-only and creates no runtime cycle. If
  Task 3's `mirror-state.ts` does not yet exist when this task runs, define
  `PublicationRow` in `mirror-state.ts` **first** as an empty stub file exporting only
  the interface, or run Task 3's interface step before this test. The plan orders Task 3
  after Task 2, so add the `PublicationRow` interface to `mirror-state.ts` as the very
  first sub-step here — see step 1.)
- Produces (locked signature):
  ```ts
  export function buildJobs(
    snapshot: SnapshotRow[],
    mirror: PublicationRow[],
    snapshotListings: Map<string, MirrorListing>,
    enabled: Platform[],
  ): Job[];
  ```

**Steps**

- [ ] **Pre-req (interface only):** create `lib/bot/mirror-state.ts` containing ONLY the
  `PublicationRow` interface so the reconciler and its test can import the type. (Task 3
  fills in `loadPublications`/`recordResult` later in the same file.)
  ```ts
  import type { Platform } from "@/lib/bot/types";

  export interface PublicationRow {
    lespacId: string;
    platform: Platform;
    status: "pending" | "live" | "failed" | "removed";
    externalUrl: string | null;
    externalId: string | null;
    publishedHash: string | null;
    attemptCount: number;
  }
  ```

- [ ] **Write the failing test** `tests/unit/bot-reconciler.test.ts` (FULL code):
  ```ts
  import { describe, it, expect } from "vitest";
  import { buildJobs } from "@/lib/bot/reconciler";
  import type { SnapshotRow } from "@/lib/bot/snapshot";
  import type { MirrorListing, Platform } from "@/lib/bot/types";
  import type { PublicationRow } from "@/lib/bot/mirror-state";

  const ALL: Platform[] = ["facebook", "kijiji", "autotrader"];

  function listing(lespacId: string, contentHash: string): MirrorListing {
    return {
      lespacId,
      title: `Truck ${lespacId}`,
      priceCad: 50000,
      description: "desc",
      photoUrls: [`https://img/${lespacId}.jpg`],
      contentHash,
    };
  }

  function snap(lespacId: string, contentHash: string, status: "active" | "gone"): SnapshotRow {
    return { lespacId, contentHash, status };
  }

  function pub(
    lespacId: string,
    platform: Platform,
    status: PublicationRow["status"],
    publishedHash: string | null,
    externalId: string | null,
  ): PublicationRow {
    return {
      lespacId,
      platform,
      status,
      externalUrl: externalId ? `https://${platform}/ad/${externalId}` : null,
      externalId,
      publishedHash,
      attemptCount: 1,
    };
  }

  // Build the snapshotListings map from a list of MirrorListings.
  function asMap(...ls: MirrorListing[]): Map<string, MirrorListing> {
    return new Map(ls.map((l) => [l.lespacId, l]));
  }

  describe("buildJobs — CREATE", () => {
    it("new active listing with no publications → one CREATE per enabled platform", () => {
      const l = listing("A", "h1");
      const jobs = buildJobs([snap("A", "h1", "active")], [], asMap(l), ALL);
      expect(jobs).toHaveLength(3);
      for (const platform of ALL) {
        const job = jobs.find((j) => j.platform === platform);
        expect(job).toBeDefined();
        expect(job!).toEqual({
          action: "create",
          platform,
          lespacId: "A",
          listing: l,
          externalId: null,
        });
      }
    });

    it("respects the enabled list — only enabled platforms get jobs", () => {
      const l = listing("A", "h1");
      const jobs = buildJobs([snap("A", "h1", "active")], [], asMap(l), ["facebook"]);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].platform).toBe("facebook");
      expect(jobs[0].action).toBe("create");
    });

    it("only the missing platform gets a CREATE when another is already live & current", () => {
      const l = listing("A", "h1");
      const mirror = [pub("A", "facebook", "live", "h1", "fb-1")];
      const jobs = buildJobs([snap("A", "h1", "active")], mirror, asMap(l), ["facebook", "kijiji"]);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toEqual({
        action: "create",
        platform: "kijiji",
        lespacId: "A",
        listing: l,
        externalId: null,
      });
    });

    it("active listing with a 'removed' publication → re-CREATE", () => {
      const l = listing("A", "h1");
      const mirror = [pub("A", "facebook", "removed", "h1", "fb-1")];
      const jobs = buildJobs([snap("A", "h1", "active")], mirror, asMap(l), ["facebook"]);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toEqual({
        action: "create",
        platform: "facebook",
        lespacId: "A",
        listing: l,
        externalId: null,
      });
    });

    it("active listing with a 'failed' publication → re-CREATE (re-attempt next cycle)", () => {
      const l = listing("A", "h1");
      const mirror = [pub("A", "facebook", "failed", null, null)];
      const jobs = buildJobs([snap("A", "h1", "active")], mirror, asMap(l), ["facebook"]);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].action).toBe("create");
      expect(jobs[0].externalId).toBeNull();
      expect(jobs[0].listing).toEqual(l);
    });
  });

  describe("buildJobs — UPDATE", () => {
    it("live publication with stale hash → UPDATE carrying externalId", () => {
      const l = listing("A", "h2"); // snapshot now h2
      const mirror = [pub("A", "facebook", "live", "h1", "fb-1")]; // published h1
      const jobs = buildJobs([snap("A", "h2", "active")], mirror, asMap(l), ["facebook"]);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toEqual({
        action: "update",
        platform: "facebook",
        lespacId: "A",
        listing: l,
        externalId: "fb-1",
      });
    });

    it("price change yields UPDATE only (no create/remove)", () => {
      const l = listing("A", "h2");
      const mirror = [
        pub("A", "facebook", "live", "h1", "fb-1"),
        pub("A", "kijiji", "live", "h1", "kj-1"),
      ];
      const jobs = buildJobs([snap("A", "h2", "active")], mirror, asMap(l), ["facebook", "kijiji"]);
      expect(jobs).toHaveLength(2);
      expect(jobs.every((j) => j.action === "update")).toBe(true);
      expect(jobs.map((j) => j.externalId).sort()).toEqual(["fb-1", "kj-1"]);
    });
  });

  describe("buildJobs — REMOVE", () => {
    it("gone listing with a live publication → REMOVE carrying externalId, listing null", () => {
      const mirror = [pub("A", "facebook", "live", "h1", "fb-1")];
      const jobs = buildJobs([snap("A", "h1", "gone")], mirror, asMap(), ["facebook"]);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toEqual({
        action: "remove",
        platform: "facebook",
        lespacId: "A",
        listing: null,
        externalId: "fb-1",
      });
    });

    it("gone listing with a live publication on each platform → REMOVE per live platform", () => {
      const mirror = [
        pub("A", "facebook", "live", "h1", "fb-1"),
        pub("A", "kijiji", "live", "h1", "kj-1"),
      ];
      const jobs = buildJobs([snap("A", "h1", "gone")], mirror, asMap(), ALL);
      expect(jobs).toHaveLength(2);
      expect(jobs.every((j) => j.action === "remove")).toBe(true);
      expect(jobs.every((j) => j.listing === null)).toBe(true);
    });

    it("gone listing with no live publication → no jobs", () => {
      const mirror = [
        pub("A", "facebook", "removed", "h1", "fb-1"),
        pub("A", "kijiji", "failed", null, null),
      ];
      const jobs = buildJobs([snap("A", "h1", "gone")], mirror, asMap(), ALL);
      expect(jobs).toEqual([]);
    });

    it("gone listing never mirrored → no jobs", () => {
      const jobs = buildJobs([snap("A", "h1", "gone")], [], asMap(), ALL);
      expect(jobs).toEqual([]);
    });
  });

  describe("buildJobs — pending skip", () => {
    it("active listing with a 'pending' publication → no job (in flight)", () => {
      const l = listing("A", "h1");
      const mirror = [pub("A", "facebook", "pending", null, null)];
      const jobs = buildJobs([snap("A", "h1", "active")], mirror, asMap(l), ["facebook"]);
      expect(jobs).toEqual([]);
    });

    it("gone listing with a 'pending' publication → no job (in flight)", () => {
      const mirror = [pub("A", "facebook", "pending", null, null)];
      const jobs = buildJobs([snap("A", "h1", "gone")], mirror, asMap(), ["facebook"]);
      expect(jobs).toEqual([]);
    });
  });

  describe("buildJobs — idempotency", () => {
    it("up-to-date mirror (all live, hashes match) → zero jobs", () => {
      const l = listing("A", "h1");
      const mirror = ALL.map((p) => pub("A", p, "live", "h1", `${p}-1`));
      const jobs = buildJobs([snap("A", "h1", "active")], mirror, asMap(l), ALL);
      expect(jobs).toEqual([]);
    });

    it("running buildJobs twice against an up-to-date mirror yields zero jobs both times", () => {
      const l = listing("A", "h1");
      const mirror = ALL.map((p) => pub("A", p, "live", "h1", `${p}-1`));
      const snapshot = [snap("A", "h1", "active")];
      const map = asMap(l);
      expect(buildJobs(snapshot, mirror, map, ALL)).toEqual([]);
      expect(buildJobs(snapshot, mirror, map, ALL)).toEqual([]);
    });
  });

  describe("buildJobs — mixed scenario", () => {
    it("create + update + remove + skip in one pass", () => {
      // A: new active (no pubs)           → CREATE x2
      // B: active, fb live stale, kj live current → UPDATE fb only
      // C: gone, fb live                  → REMOVE fb
      // D: active, fb pending             → skip
      const lA = listing("A", "h1");
      const lB = listing("B", "h2new");
      const lD = listing("D", "h4");
      const snapshot = [
        snap("A", "h1", "active"),
        snap("B", "h2new", "active"),
        snap("C", "h3", "gone"),
        snap("D", "h4", "active"),
      ];
      const mirror = [
        pub("B", "facebook", "live", "h2old", "fb-B"),
        pub("B", "kijiji", "live", "h2new", "kj-B"),
        pub("C", "facebook", "live", "h3", "fb-C"),
        pub("D", "facebook", "pending", null, null),
      ];
      const map = asMap(lA, lB, lD);
      const jobs = buildJobs(snapshot, mirror, map, ["facebook", "kijiji"]);

      const creates = jobs.filter((j) => j.action === "create");
      const updates = jobs.filter((j) => j.action === "update");
      const removes = jobs.filter((j) => j.action === "remove");

      // A → create on both enabled platforms; D → create on kijiji (fb is pending-skipped)
      expect(creates.map((j) => `${j.lespacId}:${j.platform}`).sort()).toEqual([
        "A:facebook",
        "A:kijiji",
        "D:kijiji",
      ]);
      expect(updates).toHaveLength(1);
      expect(updates[0]).toMatchObject({ lespacId: "B", platform: "facebook", externalId: "fb-B" });
      expect(removes).toHaveLength(1);
      expect(removes[0]).toMatchObject({ lespacId: "C", platform: "facebook", externalId: "fb-C", listing: null });
    });
  });

  describe("buildJobs — empty inputs", () => {
    it("empty snapshot → no jobs", () => {
      expect(buildJobs([], [], asMap(), ALL)).toEqual([]);
    });

    it("empty enabled list → no jobs even with active listings", () => {
      const l = listing("A", "h1");
      expect(buildJobs([snap("A", "h1", "active")], [], asMap(l), [])).toEqual([]);
    });
  });
  ```

- [ ] **Run, expect FAIL** (module not yet implemented):
  `pnpm exec vitest run tests/unit/bot-reconciler.test.ts`
  Expect: import/resolution failure or all assertions failing.

- [ ] **Minimal implementation** `lib/bot/reconciler.ts` (FULL code):
  ```ts
  import type { SnapshotRow } from "@/lib/bot/snapshot";
  import type { Job, MirrorListing, Platform } from "@/lib/bot/types";
  import type { PublicationRow } from "@/lib/bot/mirror-state";

  /**
   * Pure reconciler. Diffs a LesPAC snapshot against stored mirror state and
   * emits per-platform CREATE / UPDATE / REMOVE jobs. No I/O. Deterministic and
   * idempotent: re-running against an up-to-date mirror yields zero jobs.
   *
   * Rule table — see docs/superpowers/plans/_parts/03-reconciler-mirrorstate.md.
   */
  export function buildJobs(
    snapshot: SnapshotRow[],
    mirror: PublicationRow[],
    snapshotListings: Map<string, MirrorListing>,
    enabled: Platform[],
  ): Job[] {
    // Index mirror rows by `${lespacId} ${platform}` for O(1) lookup.
    const pubByKey = new Map<string, PublicationRow>();
    for (const row of mirror) {
      pubByKey.set(key(row.lespacId, row.platform), row);
    }

    const jobs: Job[] = [];

    // Pass 1: active listings → CREATE / UPDATE (per enabled platform).
    for (const platform of enabled) {
      for (const row of snapshot) {
        if (row.status !== "active") continue;
        const pub = pubByKey.get(key(row.lespacId, platform));
        const listing = snapshotListings.get(row.lespacId);
        if (!listing) continue; // defensive: snapshot row without listing payload

        if (!pub || pub.status === "removed" || pub.status === "failed") {
          jobs.push({
            action: "create",
            platform,
            lespacId: row.lespacId,
            listing,
            externalId: null,
          });
          continue;
        }
        if (pub.status === "pending") continue; // in flight
        // pub.status === "live"
        if (pub.publishedHash !== row.contentHash) {
          jobs.push({
            action: "update",
            platform,
            lespacId: row.lespacId,
            listing,
            externalId: pub.externalId,
          });
        }
      }
    }

    // Pass 2: gone listings with a live publication → REMOVE (per enabled platform).
    for (const platform of enabled) {
      for (const row of snapshot) {
        if (row.status !== "gone") continue;
        const pub = pubByKey.get(key(row.lespacId, platform));
        if (pub && pub.status === "live") {
          jobs.push({
            action: "remove",
            platform,
            lespacId: row.lespacId,
            listing: null,
            externalId: pub.externalId,
          });
        }
      }
    }

    return jobs;
  }

  function key(lespacId: string, platform: Platform): string {
    return `${lespacId} ${platform}`;
  }
  ```

- [ ] **Run, expect PASS:**
  `pnpm exec vitest run tests/unit/bot-reconciler.test.ts`
  Expect: all tests green.

- [ ] **Lint + typecheck:**
  `pnpm exec eslint lib/bot/reconciler.ts lib/bot/types.ts lib/bot/mirror-state.ts tests/unit/bot-reconciler.test.ts && pnpm exec tsc --noEmit`

- [ ] **Commit:**
  ```
  feat(bot): pure reconciler buildJobs + Job type

  buildJobs diffs a LesPAC snapshot against platform_publication mirror state
  and emits CREATE/UPDATE/REMOVE jobs per enabled platform. Pure, deterministic,
  idempotent. failed→re-create, pending→skip. Exhaustive unit coverage.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
  ```

---

### Task 3 — `lib/bot/mirror-state.ts` `loadPublications` + `recordResult`

Fills in the persistence layer in the same file that already holds the `PublicationRow`
interface (added in Task 2's pre-req step). `loadPublications` maps DB snake_case →
camelCase; `recordResult` upserts the `(lespac_id, platform)` row from a `Job` + outcome,
incrementing `attempt_count`.

**Files**
- Modify: `lib/bot/mirror-state.ts` (append the two functions below the existing
  `PublicationRow` interface)
- Test: `tests/unit/bot-mirror-state.test.ts`

**Interfaces**
- Consumes:
  ```ts
  import type { SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "@/lib/supabase/types";
  import type { Job } from "@/lib/bot/types";
  ```
- Produces (locked signatures):
  ```ts
  export async function loadPublications(
    supabase: SupabaseClient<Database>,
  ): Promise<PublicationRow[]>;

  export async function recordResult(
    supabase: SupabaseClient<Database>,
    job: Job,
    outcome: {
      status: PublicationRow["status"];
      externalId?: string;
      externalUrl?: string;
      publishedHash?: string;
      error?: string;
    },
  ): Promise<void>;
  ```

**Persistence semantics (decided, tested):**
- `loadPublications` → `select("*").from("platform_publication")`; maps each DB row to a
  `PublicationRow` (snake→camel); `attempt_count` null/undefined → `0`. On Supabase
  error, throws (the caller's cycle aborts loudly rather than reconciling against a
  partial mirror).
- `recordResult` reads the existing row for `(job.lespacId, job.platform)` to obtain the
  current `attempt_count`, then `upsert`s with `onConflict: "lespac_id,platform"`:
  - `status` ← `outcome.status`
  - `last_action` ← `job.action`
  - `attempt_count` ← `(existing.attempt_count ?? 0) + 1`
  - `external_id` / `external_url` / `published_hash` ← set only when present in
    `outcome` (otherwise preserve via the read row; on a fresh row they default to null)
  - `error_message` ← `outcome.error ?? null`
  - `last_attempt_at` ← now (ISO)
  - `last_success_at` ← now when `outcome.status === "live"`, else preserve existing
  The reconciler/executor is single-threaded per `(lespacId, platform)` within a cycle
  (spec §Human-paced: jobs run sequentially per platform), so the read-then-upsert
  increment is race-free; no DB-side atomic increment / RPC is needed.

**Steps**

- [ ] **Write the failing test** `tests/unit/bot-mirror-state.test.ts` (FULL code).
  Uses a hand-rolled Supabase mock (matching the repo's existing mocking style in
  `tests/unit/listings-queries.test.ts`) that records the upsert payload and conflict
  options for assertion:
  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import { loadPublications, recordResult } from "@/lib/bot/mirror-state";
  import type { Job } from "@/lib/bot/types";

  type DbRow = Record<string, unknown>;

  // Captures the last upsert call so tests can assert the written payload.
  interface Capture {
    selectRows: DbRow[]; // rows returned by select("*")
    eqRow: DbRow | null; // row returned for the (lespac_id, platform) read in recordResult
    upsert: { payload: DbRow; options: Record<string, unknown> | undefined } | null;
  }

  function makeSupabase(capture: Capture) {
    return {
      from(_table: string) {
        return {
          // loadPublications path: select("*") is awaited directly
          select(_cols: string) {
            const chain = {
              // recordResult read path: .eq().eq().maybeSingle()
              eq() {
                return chain;
              },
              maybeSingle() {
                return Promise.resolve({ data: capture.eqRow, error: null });
              },
              then(resolve: (v: { data: DbRow[]; error: null }) => unknown) {
                return Promise.resolve({ data: capture.selectRows, error: null }).then(resolve);
              },
            };
            return chain;
          },
          upsert(payload: DbRow, options?: Record<string, unknown>) {
            capture.upsert = { payload, options };
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    } as unknown as Parameters<typeof loadPublications>[0];
  }

  function job(overrides: Partial<Job> = {}): Job {
    return {
      action: "create",
      platform: "facebook",
      lespacId: "A",
      listing: {
        lespacId: "A",
        title: "Truck A",
        priceCad: 50000,
        description: "d",
        photoUrls: [],
        contentHash: "h1",
      },
      externalId: null,
      ...overrides,
    };
  }

  describe("loadPublications", () => {
    let capture: Capture;
    beforeEach(() => {
      capture = { selectRows: [], eqRow: null, upsert: null };
    });

    it("maps DB snake_case rows to camelCase PublicationRow", async () => {
      capture.selectRows = [
        {
          lespac_id: "A",
          platform: "facebook",
          status: "live",
          external_url: "https://facebook/ad/fb-1",
          external_id: "fb-1",
          published_hash: "h1",
          attempt_count: 3,
        },
      ];
      const rows = await loadPublications(makeSupabase(capture));
      expect(rows).toEqual([
        {
          lespacId: "A",
          platform: "facebook",
          status: "live",
          externalUrl: "https://facebook/ad/fb-1",
          externalId: "fb-1",
          publishedHash: "h1",
          attemptCount: 3,
        },
      ]);
    });

    it("defaults attempt_count to 0 when null", async () => {
      capture.selectRows = [
        {
          lespac_id: "B",
          platform: "kijiji",
          status: "pending",
          external_url: null,
          external_id: null,
          published_hash: null,
          attempt_count: null,
        },
      ];
      const rows = await loadPublications(makeSupabase(capture));
      expect(rows[0].attemptCount).toBe(0);
      expect(rows[0].externalUrl).toBeNull();
    });

    it("returns [] when no rows", async () => {
      const rows = await loadPublications(makeSupabase(capture));
      expect(rows).toEqual([]);
    });
  });

  describe("recordResult", () => {
    let capture: Capture;
    beforeEach(() => {
      capture = { selectRows: [], eqRow: null, upsert: null };
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-22T12:00:00.000Z"));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("upserts keyed on (lespac_id, platform) with onConflict", async () => {
      await recordResult(makeSupabase(capture), job(), { status: "pending" });
      expect(capture.upsert).not.toBeNull();
      expect(capture.upsert!.options).toMatchObject({ onConflict: "lespac_id,platform" });
      expect(capture.upsert!.payload).toMatchObject({
        lespac_id: "A",
        platform: "facebook",
      });
    });

    it("writes status, last_action, error_message and timestamps", async () => {
      await recordResult(makeSupabase(capture), job({ action: "update", externalId: "fb-1" }), {
        status: "failed",
        error: "page changed",
      });
      const p = capture.upsert!.payload;
      expect(p.status).toBe("failed");
      expect(p.last_action).toBe("update");
      expect(p.error_message).toBe("page changed");
      expect(p.last_attempt_at).toBe("2026-06-22T12:00:00.000Z");
      // not a success → last_success_at not set to now
      expect(p.last_success_at ?? null).toBeNull();
    });

    it("increments attempt_count from the existing row", async () => {
      capture.eqRow = { attempt_count: 2 };
      await recordResult(makeSupabase(capture), job(), { status: "live", externalId: "fb-1" });
      expect(capture.upsert!.payload.attempt_count).toBe(3);
    });

    it("starts attempt_count at 1 when no existing row", async () => {
      capture.eqRow = null;
      await recordResult(makeSupabase(capture), job(), { status: "pending" });
      expect(capture.upsert!.payload.attempt_count).toBe(1);
    });

    it("records external_id/url/published_hash and last_success_at on a live result", async () => {
      await recordResult(makeSupabase(capture), job({ action: "create" }), {
        status: "live",
        externalId: "fb-1",
        externalUrl: "https://facebook/ad/fb-1",
        publishedHash: "h1",
      });
      const p = capture.upsert!.payload;
      expect(p.status).toBe("live");
      expect(p.external_id).toBe("fb-1");
      expect(p.external_url).toBe("https://facebook/ad/fb-1");
      expect(p.published_hash).toBe("h1");
      expect(p.last_success_at).toBe("2026-06-22T12:00:00.000Z");
      expect(p.error_message ?? null).toBeNull();
    });

    it("clears error_message to null when outcome has no error", async () => {
      await recordResult(makeSupabase(capture), job(), { status: "live", externalId: "fb-1" });
      expect(capture.upsert!.payload.error_message ?? null).toBeNull();
    });
  });
  ```
  > Note: add `import { afterEach } from "vitest";` to the import line (or include
  > `afterEach` alongside the other named imports) — shown split for readability.

- [ ] **Run, expect FAIL** (functions not yet implemented):
  `pnpm exec vitest run tests/unit/bot-mirror-state.test.ts`

- [ ] **Implementation** — append to `lib/bot/mirror-state.ts` below the
  `PublicationRow` interface (FULL code):
  ```ts
  import type { SupabaseClient } from "@supabase/supabase-js";
  import type { Database } from "@/lib/supabase/types";
  import type { Job } from "@/lib/bot/types";

  // (PublicationRow interface declared above in this file.)

  const TABLE = "platform_publication";

  /** Load all mirror rows and map DB snake_case → PublicationRow camelCase. */
  export async function loadPublications(
    supabase: SupabaseClient<Database>,
  ): Promise<PublicationRow[]> {
    const { data, error } = await supabase.from(TABLE).select("*");
    if (error) {
      throw new Error(`loadPublications: ${error.message}`);
    }
    return (data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        lespacId: row.lespac_id as string,
        platform: row.platform as PublicationRow["platform"],
        status: row.status as PublicationRow["status"],
        externalUrl: (row.external_url as string | null) ?? null,
        externalId: (row.external_id as string | null) ?? null,
        publishedHash: (row.published_hash as string | null) ?? null,
        attemptCount: (row.attempt_count as number | null) ?? 0,
      };
    });
  }

  /**
   * Persist the outcome of a job. Upserts the (lespac_id, platform) row,
   * incrementing attempt_count from the current value (single-threaded per
   * key within a cycle, so read-then-write is race-free).
   */
  export async function recordResult(
    supabase: SupabaseClient<Database>,
    job: Job,
    outcome: {
      status: PublicationRow["status"];
      externalId?: string;
      externalUrl?: string;
      publishedHash?: string;
      error?: string;
    },
  ): Promise<void> {
    const { data: existing } = await supabase
      .from(TABLE)
      .select("attempt_count")
      .eq("lespac_id", job.lespacId)
      .eq("platform", job.platform)
      .maybeSingle();

    const prevAttempts =
      ((existing as Record<string, unknown> | null)?.attempt_count as number | null) ?? 0;
    const now = new Date().toISOString();

    const payload: Record<string, unknown> = {
      lespac_id: job.lespacId,
      platform: job.platform,
      status: outcome.status,
      last_action: job.action,
      attempt_count: prevAttempts + 1,
      error_message: outcome.error ?? null,
      last_attempt_at: now,
    };
    if (outcome.externalId !== undefined) payload.external_id = outcome.externalId;
    if (outcome.externalUrl !== undefined) payload.external_url = outcome.externalUrl;
    if (outcome.publishedHash !== undefined) payload.published_hash = outcome.publishedHash;
    if (outcome.status === "live") payload.last_success_at = now;

    const { error } = await supabase
      .from(TABLE)
      .upsert(payload, { onConflict: "lespac_id,platform" });
    if (error) {
      throw new Error(`recordResult ${job.lespacId}/${job.platform}: ${error.message}`);
    }
  }
  ```
  > If `tsc` complains that `"platform_publication"` is not in the generated
  > `Database` type (types not yet regenerated from the migration part), cast the
  > builder entry: `supabase.from(TABLE as never)`. Prefer regenerating types
  > (`generate_typescript_types` MCP) once the migration part has landed and dropping
  > the cast. Document whichever was used in the commit body.

- [ ] **Run, expect PASS:**
  `pnpm exec vitest run tests/unit/bot-mirror-state.test.ts`

- [ ] **Full suite + lint + typecheck:**
  `pnpm exec vitest run tests/unit/bot-reconciler.test.ts tests/unit/bot-mirror-state.test.ts && pnpm exec eslint lib/bot/mirror-state.ts tests/unit/bot-mirror-state.test.ts && pnpm exec tsc --noEmit`

- [ ] **Commit:**
  ```
  feat(bot): mirror-state loadPublications + recordResult

  loadPublications maps platform_publication snake_case → PublicationRow.
  recordResult upserts on (lespac_id, platform), increments attempt_count,
  sets last_action/error_message/timestamps and last_success_at on live.
  Tested against a mocked Supabase client.

  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
  ```

---

### Cross-part notes / dependencies

- **Type-only import direction:** `reconciler.ts` imports `PublicationRow` from
  `mirror-state.ts` (type-only, no runtime cycle). The `PublicationRow` interface is
  declared in `mirror-state.ts` as the *first* sub-step of Task 2 so the reconciler
  compiles before Task 3 fills in the functions.
- **`platform_publication` table** is created by the migration part. If its types are not
  yet in `lib/supabase/types.ts`, use the documented `as never` cast and remove it after
  regenerating types.
- **Retry-cap / pacing** are explicitly **out of scope** for the reconciler (it stays
  pure). The executor/harness part consults `attemptCount` and applies the per-cycle cap.


# Phase D — Browser Layer (Harness + Facebook Driver)

## Part 04 — Browser-automation layer (harness + Facebook Marketplace driver)

This part implements the Playwright-based browser-automation layer behind the
`PlatformDriver` contract from the design spec
(`docs/superpowers/specs/2026-06-22-lespac-mirror-bot-design.md`, sections
"Driver contract & login" and "Safety behaviors").

> **The unknowable-selectors reality.** Facebook Marketplace's live DOM ships
> obfuscated, frequently-rotated class names and no stable test ids. The exact
> CSS/ARIA selectors **cannot** be known when this plan is written and **will**
> drift over time. We do not paper over this with invented selectors. Instead
> every driver file opens with a single `SELECTORS` constants block marked
> `DISCOVER + FILL`, and each browser task contains an explicit **selector
> discovery** step with the exact `playwright codegen` command the engineer runs
> against the live site to read the current selectors and paste them in. This is
> the genuine, unavoidable manual work — it is isolated to those constants so the
> surrounding skeleton (control flow, retries, error mapping, field mapping) is
> fully specified and fully unit-tested.
>
> Throughout this part, every step is tagged either **[SPEC]** (fully specified
> code, written from the plan as-is) or **[DISCOVER]** (manual work against the
> live site — codegen, fill constants, smoke test). Manual end-to-end checks are
> tagged **MANUAL** and live at the end of the driver task.

**Locked contract consumed from other parts** (do not redefine — import only):

```ts
// from lib/bot/types.ts (base types owned by the reconciler part)
export type Platform = "facebook" | "kijiji" | "autotrader";
export interface MirrorListing {
  lespacId: string;
  title: string;
  priceCad: number | null;
  description: string;
  photoUrls: string[];
  contentHash: string;
}
export interface PublishResult { externalId: string; url: string; }
```

---

### Task 1 — Append error classes + `PlatformDriver` interface to `lib/bot/types.ts`

**Files**
- `lib/bot/types.ts` (Modify — append only; base types already present)

**Interfaces**
- Consumes: `Platform`, `MirrorListing`, `PublishResult` (already in file); `BrowserContext` (from `playwright`).
- Produces: `SessionExpiredError`, `TransientError`, `FatalError`, `PlatformDriver`.

**Steps**
- [ ] **[SPEC]** Append the import and exports to `lib/bot/types.ts`:
  ```ts
  import type { BrowserContext } from "playwright";

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
  ```
- [ ] **[SPEC]** Run `pnpm typecheck` — PASS (no consumers yet; types compile).
- [ ] **[SPEC]** Commit: `feat(bot): add driver error classes + PlatformDriver interface`

---

### Task 2 — `lib/bot/harness.ts` (`runWithSession`, `downloadPhotos`, `pace`)

The shared harness owns everything that is **not** platform-specific: launching
Chromium, loading/re-saving `storageState`, failure screenshots, photo download
to temp files, and human-paced jitter. This is fully specifiable — no selectors —
so it is written and unit-tested first (TDD).

**Files**
- `tests/unit/bot-harness.test.ts` (Create — write first, must FAIL)
- `lib/bot/harness.ts` (Create)

**Interfaces**
- Consumes: `Platform` from `lib/bot/types.ts`; `playwright` (`chromium`, `BrowserContext`); `node:fs`, `node:os`, `node:path`, `node:crypto`.
- Produces:
  ```ts
  export interface SessionPaths { storageState: string; }       // sessions/<platform>.json
  export function sessionPaths(platform: Platform): SessionPaths;
  export async function runWithSession<T>(
    platform: Platform,
    fn: (ctx: BrowserContext) => Promise<T>,
  ): Promise<T>;
  export async function downloadPhotos(urls: string[]): Promise<string[]>;
  export function pace(): Promise<void>;
  ```

**Steps**
- [ ] **[SPEC]** Write `tests/unit/bot-harness.test.ts` first (FAIL — module not created):
  - `downloadPhotos`: stub global `fetch` to return a small `ArrayBuffer`; assert it
    returns N local paths, each file exists on disk and contains the stubbed bytes;
    assert a non-200 response throws `TransientError`; clean up temp files in
    `afterEach`.
  - `pace`: assert the returned promise resolves and the elapsed time is within the
    configured `[min, max]` bounds. To keep the test fast and deterministic, `pace`
    reads its bounds from `BOT_PACE_MIN_MS` / `BOT_PACE_MAX_MS` env (default
    `4000`/`12000`); the test sets them to `5`/`15` and asserts elapsed ∈ `[0, 60]`ms.
  - `runWithSession` failure path: `vi.mock("playwright")` so `chromium.launch`
    returns a fake browser whose `newContext` returns a fake `ctx` with a stub
    `storageState()` and a fake `page`; have the supplied `fn` throw; assert a
    screenshot was requested into `sessions/failures/<platform>-<ts>.png`, that
    `browser.close()` was called, and that the original error is rethrown
    (mock `fs`/`page.screenshot` to avoid real disk/browser).
  - `runWithSession` success path: `fn` resolves; assert `ctx.storageState({ path })`
    was called with `sessions/<platform>.json` and the resolved value is returned.
- [ ] **[SPEC]** Run `pnpm test tests/unit/bot-harness.test.ts` — confirm FAIL.
- [ ] **[SPEC]** Implement `lib/bot/harness.ts`:
  ```ts
  import { chromium, type BrowserContext } from "playwright";
  import { promises as fs } from "node:fs";
  import os from "node:os";
  import path from "node:path";
  import { randomUUID } from "node:crypto";
  import type { Platform } from "@/lib/bot/types";
  import { TransientError } from "@/lib/bot/types";

  const SESSIONS_DIR = path.resolve(process.cwd(), "sessions");
  const FAILURES_DIR = path.join(SESSIONS_DIR, "failures");

  export interface SessionPaths { storageState: string; }

  export function sessionPaths(platform: Platform): SessionPaths {
    return { storageState: path.join(SESSIONS_DIR, `${platform}.json`) };
  }

  /** Randomized human-like delay (jitter). Bounds overridable for tests. */
  export function pace(): Promise<void> {
    const min = Number(process.env.BOT_PACE_MIN_MS ?? 4000);
    const max = Number(process.env.BOT_PACE_MAX_MS ?? 12000);
    const ms = min + Math.random() * Math.max(0, max - min);
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Download remote photos to temp files; return local paths for upload. */
  export async function downloadPhotos(urls: string[]): Promise<string[]> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bot-photos-"));
    const out: string[] = [];
    for (const [i, url] of urls.entries()) {
      const res = await fetch(url);
      if (!res.ok) throw new TransientError(`photo download ${res.status}: ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const ext = (url.split("?")[0].match(/\.(jpe?g|png|webp)$/i)?.[1] ?? "jpg")
        .toLowerCase();
      const file = path.join(dir, `${String(i).padStart(2, "0")}.${ext}`);
      await fs.writeFile(file, buf);
      out.push(file);
    }
    return out;
  }

  /**
   * Launch headless Chromium, load sessions/<platform>.json storageState, run fn,
   * re-save storageState on success; on throw capture a failure screenshot to
   * sessions/failures/<platform>-<ts>.png, then rethrow.
   */
  export async function runWithSession<T>(
    platform: Platform,
    fn: (ctx: BrowserContext) => Promise<T>,
  ): Promise<T> {
    const { storageState } = sessionPaths(platform);
    await fs.mkdir(FAILURES_DIR, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    let ctx: BrowserContext | undefined;
    try {
      ctx = await browser.newContext({ storageState });
      const result = await fn(ctx);
      await ctx.storageState({ path: storageState });   // re-save refreshed cookies
      return result;
    } catch (err) {
      if (ctx) {
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        const shot = path.join(FAILURES_DIR, `${platform}-${ts}.png`);
        try {
          const pages = ctx.pages();
          const page = pages[pages.length - 1];
          if (page) await page.screenshot({ path: shot, fullPage: true });
        } catch {
          /* screenshot is best-effort; never mask the original error */
        }
      }
      throw err;
    } finally {
      await browser.close();
    }
  }
  ```
  > Note: `runWithSession` deliberately does **not** classify errors — driver
  > methods throw the typed errors; the harness only screenshots + rethrows so the
  > reconciler part can route on the type. `downloadUuid`/`randomUUID` is imported
  > for future per-run temp namespacing if needed; drop if unused at lint time.
- [ ] **[SPEC]** Run `pnpm test tests/unit/bot-harness.test.ts` — confirm PASS.
- [ ] **[SPEC]** `pnpm lint && pnpm typecheck` — PASS.
- [ ] **[SPEC]** Commit: `feat(bot): add browser harness (session, photos, pacing)`

---

### Task 3 — `scripts/bot-login.mjs` + `pnpm bot:login <platform>` + ignore `sessions/`

One-time interactive login. Launches a **headed** Chromium on the operator's
machine, lets them log in by hand (2FA/CAPTCHA solved once by a human), then saves
`storageState` to `sessions/<platform>.json`. Fully specifiable.

**Files**
- `scripts/bot-login.mjs` (Create)
- `package.json` (Modify — add `"bot:login"` script)
- `.gitignore` (Modify — ignore `sessions/`)

**Interfaces**
- Consumes: `playwright` (`chromium`); `node:readline`. CLI arg `<platform>`.
- Produces: `sessions/<platform>.json` storageState file; console success/usage.

**Steps**
- [ ] **[SPEC]** Add to `.gitignore` (sessions contain live auth cookies — never commit):
  ```gitignore
  # bot Playwright sessions (live auth cookies + failure screenshots)
  /sessions/
  ```
- [ ] **[SPEC]** Add to `package.json` scripts: `"bot:login": "node scripts/bot-login.mjs"`.
- [ ] **[SPEC]** Write `scripts/bot-login.mjs`:
  ```js
  // Usage: pnpm bot:login <facebook|kijiji|autotrader>
  // Launches a VISIBLE browser, operator logs in by hand, saves storageState.
  import { chromium } from "playwright";
  import { mkdir } from "node:fs/promises";
  import { createInterface } from "node:readline";
  import path from "node:path";

  const LOGIN_URLS = {
    facebook: "https://www.facebook.com/login",
    kijiji: "https://www.kijiji.ca/t-login.html",
    autotrader: "https://www.autotrader.ca/login",
  };

  const platform = process.argv[2];
  if (!platform || !(platform in LOGIN_URLS)) {
    console.error(`usage: pnpm bot:login <${Object.keys(LOGIN_URLS).join("|")}>`);
    process.exit(1);
  }

  const sessionsDir = path.resolve(process.cwd(), "sessions");
  const statePath = path.join(sessionsDir, `${platform}.json`);

  function waitForEnter(prompt) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(prompt, () => { rl.close(); resolve(); }));
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(LOGIN_URLS[platform], { waitUntil: "domcontentloaded" });

  console.log(`\nA browser window opened on ${platform}.`);
  console.log("Log in by hand (handle 2FA / CAPTCHA / challenges).");
  await waitForEnter("When you are fully logged in, press ENTER here to save the session... ");

  await mkdir(sessionsDir, { recursive: true });
  await context.storageState({ path: statePath });
  await browser.close();

  console.log(`\n✓ Saved ${platform} session to ${statePath}`);
  console.log("Place this file on the server (scp) or upload via the dashboard.");
  ```
  > The spec allows "poll for a logged-in signal OR a simple press-Enter". We use
  > press-Enter: it is robust across all three platforms and immune to the same
  > selector drift that plagues the drivers — the human decides when login is done.
- [ ] **[DISCOVER]** Confirm each `LOGIN_URLS[...]` still 200s in a browser; correct
  any that redirected (login URLs drift far less than in-page selectors, but verify).
- [ ] **MANUAL** Run `pnpm bot:login facebook`, log into the dealer's FB account,
  press Enter, confirm `sessions/facebook.json` is created and non-empty.
- [ ] **[SPEC]** Commit: `feat(bot): add bot:login interactive session capture`

---

### Task 4 — `lib/bot/drivers/facebook.ts` (Facebook Marketplace driver)

The driver implements `checkSession / publish / update / remove`. The **control
flow, error classification, and field mapping are fully specified**; the **exact
selectors are discovered against the live site** and pasted into the `SELECTORS`
block. Pure helpers (`mapListingToFields`, `classifyError`) are unit-tested with
fixtures; live clicks are not unit-tested (verified MANUAL at the end).

**Files**
- `tests/unit/bot-facebook-driver.test.ts` (Create — write first, must FAIL)
- `lib/bot/drivers/facebook.ts` (Create)

**Interfaces**
- Consumes: `PlatformDriver`, `MirrorListing`, `PublishResult`, `SessionExpiredError`, `TransientError`, `FatalError` from `lib/bot/types.ts`; `downloadPhotos`, `pace` from `lib/bot/harness.ts`; `BrowserContext`, `Page`, `TimeoutError` from `playwright`.
- Produces:
  ```ts
  export interface FacebookFields {
    vehicleType: string;      // e.g. "Truck"
    year: string;
    make: string;
    model: string;
    price: string;            // digits only, "" when priceCad null
    description: string;
  }
  export function mapListingToFields(listing: MirrorListing): FacebookFields;  // pure
  export function classifyError(err: unknown, page?: Page): Error;             // pure-ish
  export const facebookDriver: PlatformDriver;
  ```

#### 4a — Pure helpers first (TDD, fully specified)

- [ ] **[SPEC]** Write `tests/unit/bot-facebook-driver.test.ts` first (FAIL):
  - `mapListingToFields`:
    - title `"2020 Hino 195 Cab & Chassis"` → `{ year:"2020", make:"Hino", model:"195", vehicleType:"Truck", ... }`.
    - `priceCad: 49500` → `price: "49500"`; `priceCad: null` → `price: ""`.
    - title with no leading year → `year: ""`, `make`/`model` best-effort from the
      remaining tokens; assert it never throws and `description` passes through verbatim.
  - `classifyError`:
    - a `playwright` `TimeoutError` → instance of `TransientError`.
    - an `Error` whose message contains `"net::"` or `"ECONN"` → `TransientError`.
    - a sentinel `LoginRedirect` error (thrown internally when the page URL matches
      a login pattern) → `SessionExpiredError`.
    - any other `Error` → `FatalError`.
    - already-typed errors (`SessionExpiredError`/`TransientError`/`FatalError`)
      pass through unchanged (idempotent classification).
- [ ] **[SPEC]** Run `pnpm test tests/unit/bot-facebook-driver.test.ts` — FAIL.
- [ ] **[SPEC]** Implement the pure helpers + error plumbing in `lib/bot/drivers/facebook.ts`:
  ```ts
  import type { BrowserContext, Page } from "playwright";
  import { TimeoutError } from "playwright";
  import type { MirrorListing, PublishResult, PlatformDriver } from "@/lib/bot/types";
  import { SessionExpiredError, TransientError, FatalError } from "@/lib/bot/types";
  import { downloadPhotos, pace } from "@/lib/bot/harness";

  /** Thrown internally the moment we detect a login redirect; classifyError maps it. */
  class LoginRedirect extends Error {}

  const LOGIN_URL_RE = /\/login|\/checkpoint|\/recover|two_step_verification/i;

  export interface FacebookFields {
    vehicleType: string;
    year: string;
    make: string;
    model: string;
    price: string;
    description: string;
  }

  /** Pure: derive Marketplace vehicle-form fields from a MirrorListing. */
  export function mapListingToFields(listing: MirrorListing): FacebookFields {
    const tokens = listing.title.trim().split(/\s+/);
    const yearMatch = tokens[0]?.match(/^(19|20)\d{2}$/);
    const year = yearMatch ? yearMatch[0] : "";
    const rest = year ? tokens.slice(1) : tokens;
    const make = rest[0] ?? "";
    const model = rest.slice(1).join(" ");
    return {
      vehicleType: "Truck",                       // dealer inventory is trucks
      year,
      make,
      model,
      price: listing.priceCad == null ? "" : String(Math.round(listing.priceCad)),
      description: listing.description,
    };
  }

  /** Pure-ish: map any thrown value to a typed driver error. page only read for url. */
  export function classifyError(err: unknown, page?: Page): Error {
    if (
      err instanceof SessionExpiredError ||
      err instanceof TransientError ||
      err instanceof FatalError
    ) return err;
    if (err instanceof LoginRedirect) return new SessionExpiredError(err.message);
    if (err instanceof TimeoutError) return new TransientError(err.message);
    if (err instanceof Error && /net::|ECONN|ENOTFOUND|ETIMEDOUT/i.test(err.message))
      return new TransientError(err.message);
    if (page && LOGIN_URL_RE.test(page.url()))
      return new SessionExpiredError(`redirected to login: ${page.url()}`);
    return new FatalError(err instanceof Error ? err.message : String(err));
  }

  /** Throw LoginRedirect if the current URL looks like an auth/challenge page. */
  function assertNotLoggedOut(page: Page): void {
    if (LOGIN_URL_RE.test(page.url())) throw new LoginRedirect(page.url());
  }
  ```
- [ ] **[SPEC]** Run the test — `mapListingToFields` + `classifyError` PASS.
  (Driver methods below add no new unit tests — they are MANUAL-verified.)

#### 4b — `SELECTORS` block (DISCOVER + FILL)

- [ ] **[SPEC]** Add the constants block near the top of `lib/bot/drivers/facebook.ts`,
  with empty/placeholder values clearly marked TODO so it fails loudly until filled:
  ```ts
  // ──────────────────────────────────────────────────────────────────────────
  // SELECTORS — DISCOVER + FILL. These CANNOT be known in advance; FB Marketplace
  // ships obfuscated, rotating class names and no test ids. Discover the CURRENT
  // selectors against the live site, then paste them here. Re-run discovery
  // whenever a driver method starts throwing FatalError("missing element ...").
  //
  // Discovery command (headed, records your clicks into selector suggestions):
  //   pnpm exec playwright codegen https://www.facebook.com/marketplace/create/vehicle
  // Prefer, in order: getByRole(...) / getByLabel(...) ARIA queries, then stable
  // attribute selectors ([aria-label="..."]). AVOID generated class names.
  // ──────────────────────────────────────────────────────────────────────────
  const SELECTORS = {
    // checkSession: an element only present when logged in (e.g. the composer entry).
    loggedInMarker: 'TODO: getByRole/aria selector for a logged-in-only element',
    // publish (create vehicle form):
    vehicleTypeField: "TODO",
    yearField: "TODO",
    makeField: "TODO",
    modelField: "TODO",
    priceField: "TODO",
    descriptionField: "TODO",
    photoInput: 'TODO: the <input type="file"> for photos',
    nextButton: "TODO",
    publishButton: "TODO",
    // result: how the live ad URL is exposed after publish (link or current url):
    publishedAdLink: "TODO",
    // update/remove (manage an existing listing):
    editPriceField: "TODO",
    editDescriptionField: "TODO",
    saveButton: "TODO",
    deleteOrSoldButton: "TODO",
    confirmButton: "TODO",
  } as const;

  const URLS = {
    marketplaceHome: "https://www.facebook.com/marketplace",
    createVehicle: "https://www.facebook.com/marketplace/create/vehicle",
    // externalId is the FB listing id; this builds its manage URL:
    manage: (id: string) => `https://www.facebook.com/marketplace/item/${id}`,
  } as const;
  ```

#### 4c — Driver methods (SPEC skeleton + DISCOVER fills)

- [ ] **[SPEC]** Implement `checkSession` — navigate + detect, **never** throws
  `SessionExpiredError` (returns bool per the locked contract):
  ```ts
  async function checkSession(ctx: BrowserContext): Promise<boolean> {
    const page = await ctx.newPage();
    try {
      await page.goto(URLS.marketplaceHome, { waitUntil: "domcontentloaded" });
      if (LOGIN_URL_RE.test(page.url())) return false;
      // [DISCOVER] loggedInMarker must resolve to a logged-in-only element.
      const marker = page.locator(SELECTORS.loggedInMarker).first();
      return await marker.isVisible({ timeout: 8000 }).catch(() => false);
    } catch {
      return false;            // any failure here = "not confirmably logged in"
    } finally {
      await page.close();
    }
  }
  ```
- [ ] **[SPEC]** Implement `publish` — SPEC control flow; selector lines are DISCOVER:
  ```ts
  async function publish(ctx: BrowserContext, listing: MirrorListing): Promise<PublishResult> {
    const fields = mapListingToFields(listing);
    const photoPaths = await downloadPhotos(listing.photoUrls);
    const page = await ctx.newPage();
    try {
      await page.goto(URLS.createVehicle, { waitUntil: "domcontentloaded" });
      assertNotLoggedOut(page);

      // [DISCOVER] each fill/select below uses a SELECTORS.* entry. The control
      // flow (order, pacing, upload, submit, url parse) is fixed; only the
      // selector strings are discovered.
      await page.fill(SELECTORS.yearField, fields.year);
      await page.fill(SELECTORS.makeField, fields.make);
      await page.fill(SELECTORS.modelField, fields.model);
      if (fields.price) await page.fill(SELECTORS.priceField, fields.price);
      await page.fill(SELECTORS.descriptionField, fields.description);
      await pace();

      await page.setInputFiles(SELECTORS.photoInput, photoPaths);
      await pace();

      await page.click(SELECTORS.nextButton).catch(() => { /* single-page variant */ });
      await pace();
      await page.click(SELECTORS.publishButton);

      // [DISCOVER] confirm how FB exposes the new ad id/url after publish.
      const link = page.locator(SELECTORS.publishedAdLink).first();
      await link.waitFor({ timeout: 20000 });
      const url = (await link.getAttribute("href")) ?? page.url();
      const externalId = url.match(/\/item\/(\d+)/)?.[1] ?? "";
      if (!externalId) throw new FatalError(`could not parse ad id from ${url}`);
      return { externalId, url };
    } catch (err) {
      throw classifyError(err, page);
    } finally {
      await page.close();
    }
  }
  ```
- [ ] **[SPEC]** Implement `update` — open existing listing, edit price/description, save:
  ```ts
  async function update(ctx: BrowserContext, externalId: string, listing: MirrorListing): Promise<void> {
    const fields = mapListingToFields(listing);
    const page = await ctx.newPage();
    try {
      await page.goto(URLS.manage(externalId), { waitUntil: "domcontentloaded" });
      assertNotLoggedOut(page);
      // [DISCOVER] the "Edit listing" affordance + edit form selectors.
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
  ```
- [ ] **[SPEC]** Implement `remove` — open listing, delete / mark sold + confirm:
  ```ts
  async function remove(ctx: BrowserContext, externalId: string): Promise<void> {
    const page = await ctx.newPage();
    try {
      await page.goto(URLS.manage(externalId), { waitUntil: "domcontentloaded" });
      assertNotLoggedOut(page);
      // [DISCOVER] the delete-or-mark-sold control + confirm dialog.
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
  ```
- [ ] **[SPEC]** Export the driver object:
  ```ts
  export const facebookDriver: PlatformDriver = {
    platform: "facebook",
    checkSession,
    publish,
    update,
    remove,
  };
  ```
- [ ] **[SPEC]** `pnpm lint && pnpm typecheck` — PASS (TODO selectors are valid strings,
  so this compiles before discovery; methods just fail at runtime until filled).
- [ ] **[SPEC]** Commit: `feat(bot): add Facebook driver skeleton + pure helpers + tests`

#### 4d — Selector discovery (DISCOVER, against the live site)

- [ ] **[DISCOVER]** Ensure `sessions/facebook.json` exists (Task 3 MANUAL step).
- [ ] **[DISCOVER]** Run codegen against the create form, signed in:
  ```bash
  pnpm exec playwright codegen --load-storage=sessions/facebook.json \
    https://www.facebook.com/marketplace/create/vehicle
  ```
  Click through the real flow (type/year/make/model, price, description, add photos,
  Next, Publish). Copy each suggested `getByRole(...)` / `getByLabel(...)` / aria
  selector into the matching `SELECTORS.*` entry. Prefer ARIA over class names.
- [ ] **[DISCOVER]** Run codegen against an existing listing to find the edit/save and
  delete/mark-sold selectors (`SELECTORS.editPriceField` … `SELECTORS.confirmButton`):
  ```bash
  pnpm exec playwright codegen --load-storage=sessions/facebook.json \
    "https://www.facebook.com/marketplace/item/<a-known-listing-id>"
  ```
- [ ] **[DISCOVER]** Determine `loggedInMarker` and `publishedAdLink` empirically from
  the snapshots (a composer-only element; the post-publish ad link or final URL).
- [ ] **[DISCOVER]** Replace every `"TODO"` in `SELECTORS`. Grep to confirm none remain:
  ```bash
  grep -n "TODO" lib/bot/drivers/facebook.ts && echo "UNFILLED SELECTORS REMAIN" || echo OK
  ```

#### 4e — Manual end-to-end verification (MANUAL — live site)

- [ ] **MANUAL** Re-run unit tests (selectors don't affect pure helpers):
  `pnpm test tests/unit/bot-facebook-driver.test.ts` — PASS.
- [ ] **MANUAL** Drive a single real publish against a throwaway/test listing via a
  tiny ad-hoc script that calls `runWithSession("facebook", (ctx) => facebookDriver.publish(ctx, testListing))`
  with `headless: false` temporarily (or `PWDEBUG=1`) so you can watch it. Confirm the
  fields fill, photos upload, and the form submits.
- [ ] **MANUAL** Open Facebook Marketplace in a normal browser as the dealer and confirm
  the new ad actually appears, with correct title/price/description/photos. Capture the
  returned `{ externalId, url }` and confirm the `url` opens that exact ad.
- [ ] **MANUAL** Run `facebookDriver.update(...)` against that ad's `externalId` with a
  changed price; confirm the price changes on the live ad.
- [ ] **MANUAL** Run `facebookDriver.remove(...)`; confirm the ad disappears / is marked sold.
- [ ] **MANUAL** Force a logged-out state (rename `sessions/facebook.json`) and confirm
  `checkSession` returns `false` and `publish` throws `SessionExpiredError` (not Fatal).
- [ ] **[SPEC]** Commit: `feat(bot): fill Facebook Marketplace selectors (verified live)`

---

### Task 5 — `lib/bot/drivers/index.ts` registry + kijiji/autotrader stubs

A typed registry so the reconciler can look up a driver by `Platform`. Only
Facebook is implemented now; kijiji/autotrader are stub drivers that throw
`FatalError("driver not implemented: <platform>")` so the registry typechecks and
the reconciler fails loudly (not silently) if it ever routes to them.

**Files**
- `lib/bot/drivers/index.ts` (Create)
- `tests/unit/bot-drivers-registry.test.ts` (Create — small, fully specified)

**Interfaces**
- Consumes: `Platform`, `PlatformDriver`, `FatalError` from `lib/bot/types.ts`; `facebookDriver` from `./facebook`.
- Produces: `export const DRIVERS: Record<Platform, PlatformDriver>;`

**Steps**
- [ ] **[SPEC]** Write `tests/unit/bot-drivers-registry.test.ts` first (FAIL):
  - `DRIVERS.facebook.platform === "facebook"`.
  - `DRIVERS.kijiji` and `DRIVERS.autotrader` exist; calling `publish`/`update`/
    `remove`/`checkSession` on them rejects with `FatalError` whose message includes
    the platform name. (Pass a dummy `ctx` cast to `any`; the stub throws before
    touching it.)
- [ ] **[SPEC]** Run the test — FAIL.
- [ ] **[SPEC]** Implement `lib/bot/drivers/index.ts`:
  ```ts
  import type { Platform, PlatformDriver, MirrorListing } from "@/lib/bot/types";
  import { FatalError } from "@/lib/bot/types";
  import { facebookDriver } from "@/lib/bot/drivers/facebook";

  function notImplemented(platform: Platform): PlatformDriver {
    const fail = (): never => {
      throw new FatalError(`driver not implemented: ${platform}`);
    };
    return {
      platform,
      checkSession: async () => fail(),
      publish: async (_ctx, _listing: MirrorListing) => fail(),
      update: async () => fail(),
      remove: async () => fail(),
    };
  }

  export const DRIVERS: Record<Platform, PlatformDriver> = {
    facebook: facebookDriver,
    kijiji: notImplemented("kijiji"),
    autotrader: notImplemented("autotrader"),
  };
  ```
- [ ] **[SPEC]** Run the test — PASS.
- [ ] **[SPEC]** `pnpm lint && pnpm typecheck` — PASS.
- [ ] **[SPEC]** Commit: `feat(bot): add driver registry + kijiji/autotrader stubs`

---

### Commit trailer (every commit in this part)

```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
```


# Phase E — Orchestration & Dashboard

## Part 05 — Orchestration, Worker & Dashboard

This part owns the integration brain (`runCycle`), the operator alerter, the
long-running worker process + its build/run wiring, and the single read-only
dashboard page. It **consumes** the locked contract types and the modules built
in earlier parts; it does not redefine them.

### Imports this part relies on (from other parts — do not redefine)

```ts
import type {
  Platform, MirrorListing, Job, SnapshotRow, PublicationRow,
} from "@/lib/bot/types";
import { SessionExpiredError, TransientError, FatalError } from "@/lib/bot/errors";
import { fetchActiveListings } from "@/lib/bot/lespac-reader";   // Promise<NormalizedListing[]>
import { computeContentHash } from "@/lib/bot/hash";
import { refreshSnapshot } from "@/lib/bot/snapshot";            // (supabase, listings) => Promise<SnapshotRow[]>
import { loadPublications, recordResult } from "@/lib/bot/mirror-state";
import { buildJobs } from "@/lib/bot/reconciler";                // (snapshot, mirror, snapshotListings:Map, enabled) => Job[]
import { runWithSession } from "@/lib/bot/harness";              // (platform, fn) => Promise<T>
import { DRIVERS } from "@/lib/bot/drivers";                     // Record<Platform, PlatformDriver>
```

`runWithSession(platform, fn)` opens **one** Playwright context for the platform
(loading `sessions/<platform>.json`), invokes `fn(ctx)`, re-saves cookies, and
closes the context. `recordResult(supabase, result)` upserts the
`platform_publication` row and appends a `bot_event`. These signatures are owned
by earlier parts; this part calls them.

---

### Task 1 — `lib/bot/config.ts` (env-driven bot configuration)

Centralizes every env knob so `runCycle`, the worker, the alerter, and the
dashboard read one typed surface instead of scattered `process.env`.

**Files**
- Create: `lib/bot/config.ts`
- Test: `tests/unit/bot-config.test.ts`

**Interfaces**

Produces:
```ts
export const ALL_PLATFORMS: readonly Platform[]; // ["facebook","kijiji","autotrader"]
export interface BotConfig {
  enabledPlatforms: Platform[]; // from BOT_PLATFORMS csv, intersected with ALL_PLATFORMS
  syncIntervalSec: number;      // SYNC_INTERVAL, default 3600
  maxJobsPerCycle: number;      // MAX_JOBS_PER_CYCLE, default 10
  maxAttempts: number;          // MAX_ATTEMPTS, default 3
  operatorEmail: string;        // OPERATOR_EMAIL (required at use sites)
  sessionsDir: string;          // BOT_SESSIONS_DIR, default "<repo>/sessions"
  screenshotsDir: string;       // BOT_SCREENSHOTS_DIR, default "<repo>/sessions/screenshots"
}
export function loadBotConfig(env?: NodeJS.ProcessEnv): BotConfig;
export const MAX_ATTEMPTS = 3; // constant the reconciler-side accounting uses
```

Consumes: `process.env`.

**Steps**

- [ ] Write failing test `tests/unit/bot-config.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import { loadBotConfig, ALL_PLATFORMS } from "@/lib/bot/config";

  describe("loadBotConfig", () => {
    it("parses enabled platforms from csv and ignores unknowns", () => {
      const cfg = loadBotConfig({ BOT_PLATFORMS: "facebook, kijiji, myspace" });
      expect(cfg.enabledPlatforms).toEqual(["facebook", "kijiji"]);
    });

    it("defaults to all platforms when BOT_PLATFORMS unset", () => {
      const cfg = loadBotConfig({});
      expect(cfg.enabledPlatforms).toEqual([...ALL_PLATFORMS]);
    });

    it("applies numeric defaults and overrides", () => {
      expect(loadBotConfig({}).syncIntervalSec).toBe(3600);
      expect(loadBotConfig({}).maxJobsPerCycle).toBe(10);
      expect(loadBotConfig({ SYNC_INTERVAL: "120", MAX_JOBS_PER_CYCLE: "2" }))
        .toMatchObject({ syncIntervalSec: 120, maxJobsPerCycle: 2 });
    });

    it("ignores non-numeric env and falls back to default", () => {
      expect(loadBotConfig({ SYNC_INTERVAL: "abc" }).syncIntervalSec).toBe(3600);
    });

    it("reads operator email", () => {
      expect(loadBotConfig({ OPERATOR_EMAIL: "ops@x.ca" }).operatorEmail).toBe("ops@x.ca");
    });
  });
  ```
- [ ] `pnpm test tests/unit/bot-config.test.ts` → **FAIL** (module missing).
- [ ] Implement `lib/bot/config.ts`:
  ```ts
  import path from "node:path";
  import type { Platform } from "@/lib/bot/types";

  export const ALL_PLATFORMS = ["facebook", "kijiji", "autotrader"] as const;
  export const MAX_ATTEMPTS = 3;

  const REPO_ROOT = process.cwd();

  export interface BotConfig {
    enabledPlatforms: Platform[];
    syncIntervalSec: number;
    maxJobsPerCycle: number;
    maxAttempts: number;
    operatorEmail: string;
    sessionsDir: string;
    screenshotsDir: string;
  }

  function num(value: string | undefined, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  export function loadBotConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
    const known = new Set<string>(ALL_PLATFORMS);
    const raw = (env.BOT_PLATFORMS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => known.has(s)) as Platform[];
    const enabledPlatforms = raw.length > 0 ? raw : [...ALL_PLATFORMS];

    const sessionsDir = env.BOT_SESSIONS_DIR ?? path.join(REPO_ROOT, "sessions");
    return {
      enabledPlatforms,
      syncIntervalSec: num(env.SYNC_INTERVAL, 3600),
      maxJobsPerCycle: num(env.MAX_JOBS_PER_CYCLE, 10),
      maxAttempts: num(env.MAX_ATTEMPTS, MAX_ATTEMPTS),
      operatorEmail: env.OPERATOR_EMAIL ?? "",
      sessionsDir,
      screenshotsDir: env.BOT_SCREENSHOTS_DIR ?? path.join(sessionsDir, "screenshots"),
    };
  }
  ```
- [ ] `pnpm test tests/unit/bot-config.test.ts` → **PASS**.
- [ ] `pnpm lint && pnpm typecheck`.
- [ ] Commit: `feat(bot): env-driven bot config`.

---

### Task 2 — `lib/bot/alerter.ts` (dedup'd operator email)

**Files**
- Create: `lib/bot/alerter.ts`
- Test: `tests/unit/bot-alerter.test.ts`

**Interfaces**

Produces (locked):
```ts
export async function alertOperator(
  supabase: SupabaseClient,
  dedupKey: string,
  subject: string,
  body: string,
): Promise<void>;
```

Consumes: `sendGraphEmail` from `@/lib/graph/mail`, `loadBotConfig` (operator
address), `bot_event` table (dedup window + audit log).

**Behavior**
- Look up the most recent `bot_event` with `action = "alert"` and
  `detail->>'dedupKey' = dedupKey` whose `created_at` is within the last 24h
  (the column is `created_at`, not `ts`). If one exists → **skip** (no email,
  no new row).
- Otherwise send via `sendGraphEmail({ to: operatorEmail, subject, html })` and
  insert a `bot_event` row recording the alert (`action: "alert"`, outcome
  `"sent"`, `detail: { dedupKey, subject }`).
- If `operatorEmail` is empty, throw — a bot with no operator address is a
  misconfiguration we surface loudly.

**Steps**

- [ ] Write failing test `tests/unit/bot-alerter.test.ts`:
  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";

  vi.mock("@/lib/graph/mail", () => ({ sendGraphEmail: vi.fn() }));
  vi.mock("@/lib/bot/config", () => ({
    loadBotConfig: () => ({ operatorEmail: "ops@x.ca" }),
  }));

  import { alertOperator } from "@/lib/bot/alerter";
  import { sendGraphEmail } from "@/lib/graph/mail";

  type Row = { ts: string; detail: { dedupKey: string } };

  // Minimal Supabase query-builder mock: select().eq().eq().gte().order().limit().maybeSingle()
  function makeSupabase(existing: Row | null) {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "order", "limit"]) {
      builder[m] = vi.fn(() => builder);
    }
    builder.maybeSingle = vi.fn().mockResolvedValue({ data: existing, error: null });
    const from = vi.fn(() => ({ ...builder, insert }));
    return { supabase: { from } as never, from, insert, builder };
  }

  beforeEach(() => vi.clearAllMocks());

  describe("alertOperator", () => {
    it("sends email and logs bot_event on first occurrence", async () => {
      const { supabase, insert } = makeSupabase(null);
      await alertOperator(supabase, "fb-session-dead", "Subject", "Body text");

      expect(sendGraphEmail).toHaveBeenCalledTimes(1);
      expect(sendGraphEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "ops@x.ca", subject: "Subject" }),
      );
      expect(insert).toHaveBeenCalledTimes(1);
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ action: "alert", detail: expect.objectContaining({ dedupKey: "fb-session-dead" }) }),
      );
    });

    it("suppresses a repeat within the dedup window", async () => {
      const recent = { ts: new Date().toISOString(), detail: { dedupKey: "fb-session-dead" } };
      const { supabase, insert } = makeSupabase(recent);
      await alertOperator(supabase, "fb-session-dead", "Subject", "Body");

      expect(sendGraphEmail).not.toHaveBeenCalled();
      expect(insert).not.toHaveBeenCalled();
    });

    it("throws when no operator email is configured", async () => {
      vi.resetModules();
      vi.doMock("@/lib/bot/config", () => ({ loadBotConfig: () => ({ operatorEmail: "" }) }));
      const { alertOperator: alert } = await import("@/lib/bot/alerter");
      const { supabase } = makeSupabase(null);
      await expect(alert(supabase, "k", "s", "b")).rejects.toThrow();
    });
  });
  ```
- [ ] `pnpm test tests/unit/bot-alerter.test.ts` → **FAIL**.
- [ ] Implement `lib/bot/alerter.ts`:
  ```ts
  import type { SupabaseClient } from "@supabase/supabase-js";
  import { sendGraphEmail } from "@/lib/graph/mail";
  import { loadBotConfig } from "@/lib/bot/config";

  const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  export async function alertOperator(
    supabase: SupabaseClient,
    dedupKey: string,
    subject: string,
    body: string,
  ): Promise<void> {
    const { operatorEmail } = loadBotConfig();
    if (!operatorEmail) {
      throw new Error("OPERATOR_EMAIL requis pour alertOperator");
    }

    const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
    const { data: recent } = await supabase
      .from("bot_event")
      .select("ts, detail")
      .eq("action", "alert")
      .eq("detail->>dedupKey", dedupKey)
      .gte("ts", since)
      .order("ts", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recent) return; // already alerted within the window

    const html = `<p>${escapeHtml(body).replace(/\n/g, "<br/>")}</p>`;
    await sendGraphEmail({ to: operatorEmail, subject, html });

    await supabase.from("bot_event").insert({
      ts: new Date().toISOString(),
      lespac_id: null,
      platform: null,
      action: "alert",
      outcome: "sent",
      detail: { dedupKey, subject },
    });
  }
  ```
- [ ] `pnpm test tests/unit/bot-alerter.test.ts` → **PASS**.
- [ ] `pnpm lint && pnpm typecheck`.
- [ ] Commit: `feat(bot): dedup'd operator alerter`.

---

### Task 3 — `lib/bot/cycle.ts` (`runCycle` — the integration brain)

Orchestrates one full sync cycle. **Sequential per platform** (never parallel —
each platform owns one browser session and pacing must not interleave).

**Files**
- Create: `lib/bot/cycle.ts`
- Test: `tests/unit/bot-cycle.test.ts`

**Interfaces**

Produces (locked):
```ts
export interface CycleSummary {
  listings: number;
  jobs: number;
  succeeded: number;
  failed: number;
  sessionsDead: Platform[];
}
export async function runCycle(): Promise<CycleSummary>;
```

Internal helper (exported for testing the pacing seam):
```ts
export function pace(ms?: number): Promise<void>; // randomized jitter delay
```

Consumes: `createAdminClient`, `loadBotConfig`, `fetchActiveListings`,
`computeContentHash`, `refreshSnapshot`, `loadPublications`, `buildJobs`,
`runWithSession`, `DRIVERS`, `recordResult`, `alertOperator`, and the typed
errors.

**Algorithm**

1. `supabase = createAdminClient()`; `cfg = loadBotConfig()`.
2. `listings = await fetchActiveListings()` → build a `Map<lespacId, MirrorListing>`
   (computing `contentHash` via `computeContentHash` where the reader hasn't).
3. `snapshot = await refreshSnapshot(supabase, listings)`.
4. `mirror = await loadPublications(supabase)`.
5. `jobs = buildJobs(snapshot, mirror, listingsMap, cfg.enabledPlatforms)`.
6. Group jobs by platform; for **each enabled platform sequentially**:
   - Take at most `cfg.maxJobsPerCycle` jobs for that platform.
   - Open **one** `runWithSession(platform, async (ctx) => { ... })`.
   - Inside the session, iterate jobs sequentially with `await pace()` between
     them:
     - dispatch `DRIVERS[platform].publish/update/remove` by `job.action`;
     - `recordResult(...)` with the new status after each.
     - **SessionExpiredError**: mark `platform_session` dead, `alertOperator`
       **once** (dedupKey `session-dead:<platform>`), `sessionsDead.push(platform)`,
       and **break** out of this platform's remaining jobs (re-throw a sentinel
       so the loop stops but the cycle continues to the next platform).
     - **TransientError**: leave the publication `pending`/`failed` for retry;
       increment `attemptCount`. If `attemptCount >= cfg.maxAttempts` →
       record `failed` + `alertOperator` (dedupKey `failed:<platform>:<lespacId>`).
     - **FatalError**: record `failed`; `alertOperator` with the screenshot path
       (dedupKey `fatal:<platform>:<lespacId>`).
     - Other unexpected error: treat as transient (retry next cycle).
   - If `runWithSession` itself throws `SessionExpiredError` (session file
     invalid before any job) → same dead-session handling, skip platform.
7. Return the accumulated `CycleSummary`.

**Steps**

- [ ] Write failing test `tests/unit/bot-cycle.test.ts`. Mock **every** imported
  module so no browser/network/DB is touched. This is the highest-value test in
  the part — exercise each branch:
  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";

  // --- mocks for every dependency -------------------------------------------
  vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: vi.fn() }) }));
  vi.mock("@/lib/bot/config", () => ({
    loadBotConfig: () => ({
      enabledPlatforms: ["facebook", "kijiji"],
      maxJobsPerCycle: 10,
      maxAttempts: 3,
    }),
  }));
  vi.mock("@/lib/bot/lespac-reader", () => ({ fetchActiveListings: vi.fn() }));
  vi.mock("@/lib/bot/hash", () => ({ computeContentHash: vi.fn(() => "h") }));
  vi.mock("@/lib/bot/snapshot", () => ({ refreshSnapshot: vi.fn() }));
  vi.mock("@/lib/bot/mirror-state", () => ({ loadPublications: vi.fn(), recordResult: vi.fn() }));
  vi.mock("@/lib/bot/reconciler", () => ({ buildJobs: vi.fn() }));
  vi.mock("@/lib/bot/harness", () => ({
    // run the body with a fake ctx so per-job logic executes inline
    runWithSession: vi.fn(async (_p: string, fn: (ctx: unknown) => Promise<unknown>) => fn({})),
  }));
  vi.mock("@/lib/bot/drivers", () => ({ DRIVERS: {} }));
  vi.mock("@/lib/bot/alerter", () => ({ alertOperator: vi.fn() }));

  import { runCycle } from "@/lib/bot/cycle";
  import { SessionExpiredError, TransientError, FatalError } from "@/lib/bot/errors";
  import { fetchActiveListings } from "@/lib/bot/lespac-reader";
  import { refreshSnapshot } from "@/lib/bot/snapshot";
  import { loadPublications, recordResult } from "@/lib/bot/mirror-state";
  import { buildJobs } from "@/lib/bot/reconciler";
  import { runWithSession } from "@/lib/bot/harness";
  import { DRIVERS } from "@/lib/bot/drivers";
  import { alertOperator } from "@/lib/bot/alerter";

  const listing = {
    lespacId: "L1", title: "T", priceCad: 1, description: "d", photoUrls: [], contentHash: "h",
  };
  function job(over: Partial<Record<string, unknown>> = {}) {
    return { action: "create", platform: "facebook", lespacId: "L1", listing, externalId: null, ...over };
  }

  function setDrivers(d: Record<string, unknown>) {
    for (const k of Object.keys(DRIVERS)) delete (DRIVERS as Record<string, unknown>)[k];
    Object.assign(DRIVERS, d);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    (fetchActiveListings as ReturnType<typeof vi.fn>).mockResolvedValue([listing]);
    (refreshSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue([
      { lespacId: "L1", contentHash: "h", status: "active" },
    ]);
    (loadPublications as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  describe("runCycle", () => {
    it("runs platforms sequentially and records one result per job", async () => {
      const order: string[] = [];
      (buildJobs as ReturnType<typeof vi.fn>).mockReturnValue([
        job({ platform: "facebook" }), job({ platform: "kijiji", lespacId: "L1" }),
      ]);
      setDrivers({
        facebook: { platform: "facebook", publish: vi.fn(async () => { order.push("fb"); return { externalId: "x", url: "u" }; }) },
        kijiji: { platform: "kijiji", publish: vi.fn(async () => { order.push("kj"); return { externalId: "y", url: "v" }; }) },
      });
      const summary = await runCycle();

      // facebook session fully handled before kijiji session opens
      expect((runWithSession as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual(["facebook", "kijiji"]);
      expect(order).toEqual(["fb", "kj"]);
      expect(recordResult).toHaveBeenCalledTimes(2);
      expect(summary.succeeded).toBe(2);
      expect(summary.failed).toBe(0);
    });

    it("short-circuits remaining jobs + alerts once on session death", async () => {
      (buildJobs as ReturnType<typeof vi.fn>).mockReturnValue([
        job({ lespacId: "L1" }), job({ lespacId: "L2" }), job({ lespacId: "L3" }),
      ]);
      const publish = vi.fn(async () => { throw new SessionExpiredError("dead"); });
      setDrivers({ facebook: { platform: "facebook", publish } });
      const summary = await runCycle();

      expect(publish).toHaveBeenCalledTimes(1);          // stops after first
      expect(alertOperator).toHaveBeenCalledTimes(1);     // exactly once
      expect(summary.sessionsDead).toContain("facebook");
    });

    it("retries transient failures and gives up after maxAttempts", async () => {
      (loadPublications as ReturnType<typeof vi.fn>).mockResolvedValue([
        { lespacId: "L1", platform: "facebook", status: "pending", attemptCount: 2,
          externalId: null, externalUrl: null, publishedHash: null },
      ]);
      (buildJobs as ReturnType<typeof vi.fn>).mockReturnValue([job({ lespacId: "L1" })]);
      setDrivers({ facebook: { platform: "facebook", publish: vi.fn(async () => { throw new TransientError("net"); }) } });
      const summary = await runCycle();

      // attemptCount 2 -> 3 == maxAttempts -> failed + alert
      expect(recordResult).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: "failed", attemptCount: 3 }),
      );
      expect(alertOperator).toHaveBeenCalledTimes(1);
      expect(summary.failed).toBe(1);
    });

    it("marks fatal as failed and alerts with screenshot", async () => {
      (buildJobs as ReturnType<typeof vi.fn>).mockReturnValue([job({ lespacId: "L1" })]);
      const err = new FatalError("page changed") as FatalError & { screenshotPath?: string };
      err.screenshotPath = "/sessions/screenshots/fb-L1.png";
      setDrivers({ facebook: { platform: "facebook", publish: vi.fn(async () => { throw err; }) } });
      await runCycle();

      expect(recordResult).toHaveBeenCalledWith(
        expect.anything(), expect.objectContaining({ status: "failed" }),
      );
      const alertArgs = (alertOperator as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(String(alertArgs[3])).toContain("/sessions/screenshots/fb-L1.png");
    });

    it("respects the per-cycle per-platform cap", async () => {
      vi.resetModules();
      vi.doMock("@/lib/bot/config", () => ({
        loadBotConfig: () => ({ enabledPlatforms: ["facebook"], maxJobsPerCycle: 1, maxAttempts: 3 }),
      }));
      // re-import everything bound to the new config
      const cycle = await import("@/lib/bot/cycle");
      const reconciler = await import("@/lib/bot/reconciler");
      const drivers = await import("@/lib/bot/drivers");
      (reconciler.buildJobs as ReturnType<typeof vi.fn>).mockReturnValue([
        job({ lespacId: "A" }), job({ lespacId: "B" }), job({ lespacId: "C" }),
      ]);
      const publish = vi.fn(async () => ({ externalId: "x", url: "u" }));
      for (const k of Object.keys(drivers.DRIVERS)) delete (drivers.DRIVERS as Record<string, unknown>)[k];
      Object.assign(drivers.DRIVERS, { facebook: { platform: "facebook", publish } });
      await cycle.runCycle();
      expect(publish).toHaveBeenCalledTimes(1); // cap = 1
    });
  });
  ```
- [ ] `pnpm test tests/unit/bot-cycle.test.ts` → **FAIL**.
- [ ] Implement `lib/bot/cycle.ts`:
  ```ts
  import type { SupabaseClient } from "@supabase/supabase-js";
  import { createAdminClient } from "@/lib/supabase/admin";
  import { loadBotConfig } from "@/lib/bot/config";
  import type { Job, MirrorListing, Platform } from "@/lib/bot/types";
  import { SessionExpiredError, TransientError, FatalError } from "@/lib/bot/errors";
  import { fetchActiveListings } from "@/lib/bot/lespac-reader";
  import { computeContentHash } from "@/lib/bot/hash";
  import { refreshSnapshot } from "@/lib/bot/snapshot";
  import { loadPublications, recordResult } from "@/lib/bot/mirror-state";
  import { buildJobs } from "@/lib/bot/reconciler";
  import { runWithSession } from "@/lib/bot/harness";
  import { DRIVERS } from "@/lib/bot/drivers";
  import { alertOperator } from "@/lib/bot/alerter";

  export interface CycleSummary {
    listings: number;
    jobs: number;
    succeeded: number;
    failed: number;
    sessionsDead: Platform[];
  }

  const PACE_MIN_MS = 8_000;
  const PACE_MAX_MS = 25_000;

  export function pace(ms?: number): Promise<void> {
    const delay = ms ?? PACE_MIN_MS + Math.floor(Math.random() * (PACE_MAX_MS - PACE_MIN_MS));
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  // sentinel used to break out of a platform's job loop on session death
  class StopPlatform extends Error {}

  function normalize(listing: MirrorListing): MirrorListing {
    return listing.contentHash
      ? listing
      : { ...listing, contentHash: computeContentHash(listing) };
  }

  async function markSessionDead(supabase: SupabaseClient, platform: Platform): Promise<void> {
    await supabase
      .from("platform_session")
      .upsert(
        { platform, health: "dead", last_validated_at: new Date().toISOString() },
        { onConflict: "platform" },
      );
  }

  export async function runCycle(): Promise<CycleSummary> {
    const supabase = createAdminClient();
    const cfg = loadBotConfig();

    const rawListings = await fetchActiveListings();
    const listings = rawListings.map(normalize);
    const listingsMap = new Map<string, MirrorListing>(listings.map((l) => [l.lespacId, l]));

    const snapshot = await refreshSnapshot(supabase, listings);
    const mirror = await loadPublications(supabase);
    const jobs = buildJobs(snapshot, mirror, listingsMap, cfg.enabledPlatforms);

    const summary: CycleSummary = {
      listings: listings.length,
      jobs: jobs.length,
      succeeded: 0,
      failed: 0,
      sessionsDead: [],
    };

    const byPlatform = new Map<Platform, Job[]>();
    for (const j of jobs) {
      const list = byPlatform.get(j.platform) ?? [];
      list.push(j);
      byPlatform.set(j.platform, list);
    }
    const mirrorByKey = new Map(mirror.map((m) => [`${m.lespacId}:${m.platform}`, m]));

    // sequential per platform — never parallel
    for (const platform of cfg.enabledPlatforms) {
      const queued = (byPlatform.get(platform) ?? []).slice(0, cfg.maxJobsPerCycle);
      if (queued.length === 0) continue;
      const driver = DRIVERS[platform];

      try {
        await runWithSession(platform, async (ctx) => {
          for (let i = 0; i < queued.length; i++) {
            const job = queued[i];
            if (i > 0) await pace();
            await runJob(supabase, cfg, driver, ctx, job, mirrorByKey, summary);
          }
        });
      } catch (err) {
        if (err instanceof StopPlatform || err instanceof SessionExpiredError) {
          await handleSessionDeath(supabase, platform, summary);
          continue;
        }
        throw err;
      }
    }

    return summary;
  }

  async function handleSessionDeath(
    supabase: SupabaseClient,
    platform: Platform,
    summary: CycleSummary,
  ): Promise<void> {
    if (summary.sessionsDead.includes(platform)) return;
    summary.sessionsDead.push(platform);
    await markSessionDead(supabase, platform);
    await alertOperator(
      supabase,
      `session-dead:${platform}`,
      `Session ${platform} expirée — ré-authentification requise`,
      `Le bot ne peut plus publier sur ${platform}. Refaire le login local: pnpm bot:login ${platform}, puis ré-uploader sessions/${platform}.json.`,
    );
  }

  async function runJob(
    supabase: SupabaseClient,
    cfg: ReturnType<typeof loadBotConfig>,
    driver: (typeof DRIVERS)[Platform],
    ctx: unknown,
    job: Job,
    mirrorByKey: Map<string, { attemptCount: number }>,
    summary: CycleSummary,
  ): Promise<void> {
    const key = `${job.lespacId}:${job.platform}`;
    const prior = mirrorByKey.get(key);
    try {
      if (job.action === "create" && job.listing) {
        const { externalId, url } = await driver.publish(ctx, job.listing);
        await recordResult(supabase, {
          lespacId: job.lespacId, platform: job.platform, status: "live",
          externalId, externalUrl: url, publishedHash: job.listing.contentHash,
          attemptCount: 0, lastAction: "create",
        });
      } else if (job.action === "update" && job.listing && job.externalId) {
        await driver.update(ctx, job.externalId, job.listing);
        await recordResult(supabase, {
          lespacId: job.lespacId, platform: job.platform, status: "live",
          externalId: job.externalId, externalUrl: null, publishedHash: job.listing.contentHash,
          attemptCount: 0, lastAction: "update",
        });
      } else if (job.action === "remove" && job.externalId) {
        await driver.remove(ctx, job.externalId);
        await recordResult(supabase, {
          lespacId: job.lespacId, platform: job.platform, status: "removed",
          externalId: job.externalId, externalUrl: null, publishedHash: null,
          attemptCount: 0, lastAction: "remove",
        });
      } else {
        return; // malformed job — skip
      }
      summary.succeeded++;
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        throw new StopPlatform(err.message); // bubble up to stop this platform
      }
      if (err instanceof FatalError) {
        await recordResult(supabase, {
          lespacId: job.lespacId, platform: job.platform, status: "failed",
          externalId: job.externalId, externalUrl: null, publishedHash: null,
          attemptCount: (prior?.attemptCount ?? 0) + 1, lastAction: job.action,
          errorMessage: err.message,
        });
        await alertOperator(
          supabase,
          `fatal:${job.platform}:${job.lespacId}`,
          `Échec fatal ${job.platform} — ${job.lespacId}`,
          `Le pilote ${job.platform} a échoué (page modifiée?). Capture: ${
            (err as FatalError & { screenshotPath?: string }).screenshotPath ?? "n/a"
          }`,
        );
        summary.failed++;
        return;
      }
      // TransientError (or any other) -> retry accounting
      const nextAttempt = (prior?.attemptCount ?? 0) + 1;
      const exhausted = nextAttempt >= cfg.maxAttempts;
      await recordResult(supabase, {
        lespacId: job.lespacId, platform: job.platform,
        status: exhausted ? "failed" : "pending",
        externalId: job.externalId, externalUrl: null, publishedHash: null,
        attemptCount: nextAttempt, lastAction: job.action,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      if (exhausted) {
        await alertOperator(
          supabase,
          `failed:${job.platform}:${job.lespacId}`,
          `Annonce ${job.lespacId} abandonnée sur ${job.platform}`,
          `Après ${cfg.maxAttempts} tentatives, le bot abandonne ${job.lespacId} sur ${job.platform}.`,
        );
        summary.failed++;
      }
      if (!(err instanceof TransientError)) {
        // keep going for unexpected errors; already recorded as retry
      }
    }
  }
  ```
  > Note for the implementer: `recordResult`'s exact payload shape is owned by
  > `lib/bot/mirror-state`. Align the object fields above with that module's
  > `RecordResultInput`; the test asserts only `status` and `attemptCount`, so
  > any extra fields are tolerated by the contract.
- [ ] `pnpm test tests/unit/bot-cycle.test.ts` → **PASS**.
- [ ] `pnpm lint && pnpm typecheck`.
- [ ] Commit: `feat(bot): runCycle orchestration brain`.

---

### Task 4 — Worker process + build/run wiring

**Run mechanism chosen: compile to `worker/dist/*.js` with `tsc`, run the plain
JS under Node.** Rationale:
- `tsx` is **not** installed (only `tsc` is on `node_modules/.bin`). Adding a
  runtime transpiler is a new dep for a process that pm2 runs in prod — avoid.
- `node --experimental-strip-types` is unreliable for `.ts` that uses the `@/*`
  path alias and `import`-erasable syntax across files; it would need extra flags
  and Node ≥22 with caveats.
- The app already ships a `tsc` build step (`pnpm typecheck`), so a small
  emit-only `tsconfig.worker.json` is the lowest-friction, most stable choice for
  a long-running prod process. pm2 then runs `node worker/dist/index.js`.

The worker tsconfig emits CommonJS so plain `node` runs it without ESM/loader
flags; the `@/*` alias is resolved at build time via `tsc-alias`-free relative
output by setting `baseUrl`/`paths` and post-resolving — **simplest path:** the
worker imports `lib/bot/*` which themselves use `@/*`. To keep this trivial, the
worker tsconfig sets `"module": "commonjs"`, `"moduleResolution": "node"`,
`baseUrl: "."`, `paths: { "@/*": ["./*"] }`, and we run the emitted output with
`node -r tsconfig-paths/register` **only if** `@/*` survives to runtime. Since
`tsc` does **not** rewrite path aliases, register `tsconfig-paths` at runtime
(add `tsconfig-paths` devDep) pointed at the worker tsconfig. (Verify during
implementation: if the smoke run resolves `@/` without it, drop the flag.)

**Files**
- Create: `worker/index.ts` (scheduler loop)
- Create: `worker/run-once.ts` (single cycle, then exit)
- Create: `tsconfig.worker.json` (emit config)
- Modify: `package.json` (scripts: `bot:build`, `bot:cycle`, `bot:start`)
- Modify: `ecosystem.config.cjs` (add `pacman-bot` app)
- Modify: `.env.example` (document bot env)

**Interfaces**

Produces:
```ts
// worker/index.ts — default no exports; side-effecting scheduler entry.
// worker/run-once.ts — side-effecting one-shot entry; exits 0/1.
```
Consumes: `runCycle` from `@/lib/bot/cycle`, `loadBotConfig` from `@/lib/bot/config`.

**Steps**

- [ ] Create `tsconfig.worker.json`:
  ```json
  {
    "extends": "./tsconfig.json",
    "compilerOptions": {
      "module": "commonjs",
      "moduleResolution": "node",
      "noEmit": false,
      "outDir": "worker/dist",
      "rootDir": ".",
      "incremental": false,
      "jsx": "react-jsx",
      "baseUrl": ".",
      "paths": { "@/*": ["./*"] }
    },
    "include": ["worker/**/*.ts", "lib/bot/**/*.ts", "lib/graph/**/*.ts", "lib/supabase/**/*.ts"]
  }
  ```
- [ ] Create `worker/run-once.ts`:
  ```ts
  import { runCycle } from "@/lib/bot/cycle";

  async function main() {
    const started = Date.now();
    const summary = await runCycle();
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(
      `[bot] cycle done in ${secs}s — listings=${summary.listings} jobs=${summary.jobs} ` +
        `ok=${summary.succeeded} failed=${summary.failed} dead=[${summary.sessionsDead.join(",")}]`,
    );
  }

  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[bot] run-once failed:", err);
      process.exit(1);
    });
  ```
- [ ] Create `worker/index.ts` (loop that never dies):
  ```ts
  import { runCycle } from "@/lib/bot/cycle";
  import { loadBotConfig } from "@/lib/bot/config";

  let stopping = false;

  async function loop() {
    const cfg = loadBotConfig();
    console.log(
      `[bot] scheduler up — interval=${cfg.syncIntervalSec}s platforms=[${cfg.enabledPlatforms.join(",")}]`,
    );
    while (!stopping) {
      const started = Date.now();
      try {
        const summary = await runCycle();
        console.log(
          `[bot] cycle ok — jobs=${summary.jobs} ok=${summary.succeeded} ` +
            `failed=${summary.failed} dead=[${summary.sessionsDead.join(",")}]`,
        );
      } catch (err) {
        // never let the loop die on an unexpected throw
        console.error("[bot] cycle threw:", err);
      }
      const elapsed = Date.now() - started;
      const wait = Math.max(0, cfg.syncIntervalSec * 1000 - elapsed);
      await sleep(wait);
    }
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      console.log(`[bot] ${sig} — stopping after current cycle`);
      stopping = true;
    });
  }

  loop().catch((err) => {
    console.error("[bot] scheduler crashed:", err);
    process.exit(1);
  });
  ```
- [ ] Add `package.json` scripts:
  ```json
  "bot:build": "tsc -p tsconfig.worker.json",
  "bot:cycle": "pnpm bot:build && node -r tsconfig-paths/register worker/dist/worker/run-once.js",
  "bot:start": "node -r tsconfig-paths/register worker/dist/worker/index.js",
  "bot:login": "node -r tsconfig-paths/register worker/dist/worker/login.js"
  ```
  > `worker/login.ts` (the visible re-auth tool, `pnpm bot:login <platform>`) is
  > owned by the harness/driver part; the script is wired here for completeness.
  > Add `tsconfig-paths` to devDependencies (`pnpm add -D tsconfig-paths`). If the
  > implementation smoke test resolves `@/` without it, drop the `-r` flag and
  > the dep.
- [ ] Add the `pacman-bot` app to `ecosystem.config.cjs` (mirror the existing
  `pacman` block; `script` runs the compiled worker):
  ```js
  {
    name: "pacman-bot",
    script: "worker/dist/worker/index.js",
    node_args: "-r tsconfig-paths/register",
    cwd: "/home/hino1/pacman",
    interpreter: "node",
    exec_mode: "fork",
    instances: 1,
    autorestart: true,
    max_restarts: 20,
    restart_delay: 5000,
    max_memory_restart: "1G",
    env: {
      NODE_ENV: "production",
      TSCONFIG_PATHS_CONFIG: "/home/hino1/pacman/tsconfig.worker.json",
      PATH: "/home/hino1/.npm-global/bin:/usr/local/bin:/usr/bin:/bin",
    },
    error_file: "/home/hino1/.pm2/logs/pacman-bot-error.log",
    out_file: "/home/hino1/.pm2/logs/pacman-bot-out.log",
    merge_logs: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss",
  }
  ```
  Add it as a second entry in the `apps: [...]` array (after `pacman`).
- [ ] Append to `.env.example`:
  ```bash
  # --- LesPAC mirror bot (pacman-bot pm2 process) ---
  # Plateformes pilotées (csv). Vide = toutes: facebook,kijiji,autotrader.
  BOT_PLATFORMS=facebook
  # Intervalle entre cycles de sync, en secondes (défaut 3600 = 1h).
  SYNC_INTERVAL=3600
  # Plafond de jobs par cycle PAR plateforme (anti-burst, anti-ban).
  MAX_JOBS_PER_CYCLE=10
  # Tentatives avant abandon d'un job transient (défaut 3).
  MAX_ATTEMPTS=3
  # Adresse de l'opérateur (alertes session morte / échecs). REQUIS.
  OPERATOR_EMAIL=
  # Répertoires de sessions Playwright et captures d'échec.
  BOT_SESSIONS_DIR=/home/hino1/pacman/sessions
  BOT_SCREENSHOTS_DIR=/home/hino1/pacman/sessions/screenshots
  ```
- [ ] Build: `pnpm bot:build` → emits `worker/dist/`. **typecheck/build gate:**
  `pnpm typecheck` (app) must stay green; `pnpm bot:build` must emit with no
  errors.
- [ ] **Node smoke** (no real cycle): with bot deps mockable, run
  `node -e "require('./worker/dist/worker/index.js')"` under a temporary
  `SYNC_INTERVAL=999999` and immediately `SIGTERM` — confirm it logs
  `scheduler up` then exits cleanly. Alternatively run `pnpm bot:cycle` against a
  test Supabase project and confirm it logs `cycle done` and exits 0.
- [ ] Commit: `feat(bot): worker scheduler + pm2 + build wiring`.

---

### Task 5 — Dashboard queries (`lib/bot/dashboard-queries.ts`)

All shaping/joining lives here (testable); the page stays thin.

**Files**
- Create: `lib/bot/dashboard-queries.ts`
- Test: `tests/unit/bot-dashboard-queries.test.ts`

**Interfaces**

Produces:
```ts
export interface SessionHealth { platform: Platform; health: "ok" | "dead" | "unknown"; lastValidatedAt: string | null; }
export interface ListingBoardRow {
  lespacId: string; title: string; priceCad: number | null; thumbnailUrl: string | null;
  status: "active" | "gone";
  platforms: Record<Platform, { status: PublicationRow["status"]; url: string | null } | null>;
}
export interface AttentionItem {
  kind: "session" | "failed" | "duplicate";
  platform: Platform; lespacId: string | null; message: string; screenshotUrl: string | null;
}
export interface ActivityEntry { ts: string; lespacId: string | null; platform: Platform | null; action: string; outcome: string; detail: string | null; }
export interface BotDashboardData {
  sessions: SessionHealth[];
  board: ListingBoardRow[];
  attention: AttentionItem[];
  activity: ActivityEntry[];
  lastSyncAt: string | null;
  nextSyncAt: string | null;
}
export async function fetchBotDashboard(supabase?: SupabaseClient): Promise<BotDashboardData>;
```

Consumes: `createAdminClient`, `loadBotConfig` (for `enabledPlatforms` +
`syncIntervalSec` to compute `nextSyncAt`), tables `platform_session`,
`platform_publication`, `lespac_listing`, `bot_event`.

**Behavior**
- `sessions`: one entry per enabled platform; missing row → `health: "unknown"`.
- `board`: each `active`/`gone` `lespac_listing` becomes a row; per-platform
  `platform_publication` joined in, `null` when no publication exists; thumbnail =
  first `photo_urls`.
- `attention`: dead sessions + `failed` publications (with screenshot link from
  the latest matching `bot_event.detail.screenshotPath`) + duplicate flags.
- `activity`: most recent N `bot_event` rows, newest first.
- `lastSyncAt`: latest `bot_event.ts`; `nextSyncAt = lastSyncAt + syncIntervalSec`.

**Steps**

- [ ] Write failing test `tests/unit/bot-dashboard-queries.test.ts` (mock
  supabase; assert shaping):
  ```ts
  import { describe, it, expect, vi, beforeEach } from "vitest";

  vi.mock("@/lib/bot/config", () => ({
    loadBotConfig: () => ({ enabledPlatforms: ["facebook", "kijiji"], syncIntervalSec: 3600 }),
  }));

  import { fetchBotDashboard } from "@/lib/bot/dashboard-queries";

  // table -> rows fixture; each from(table) returns a thenable builder
  function makeSupabase(tables: Record<string, unknown[]>) {
    function builder(table: string) {
      const rows = tables[table] ?? [];
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order", "limit"]) b[m] = vi.fn(() => b);
      // resolve as a promise when awaited
      (b as { then: unknown }).then = (res: (v: unknown) => unknown) => res({ data: rows, error: null });
      return b;
    }
    return { from: vi.fn((t: string) => builder(t)) } as never;
  }

  beforeEach(() => vi.clearAllMocks());

  describe("fetchBotDashboard", () => {
    it("shapes sessions, board, attention and activity", async () => {
      const supabase = makeSupabase({
        platform_session: [{ platform: "facebook", health: "dead", last_validated_at: "2026-06-22T10:00:00Z" }],
        lespac_listing: [{ lespac_id: "L1", title: "Hino", price_cad: 90000, photo_urls: ["p.jpg"], status: "active" }],
        platform_publication: [
          { lespac_id: "L1", platform: "facebook", status: "failed", external_url: null, attempt_count: 3 },
          { lespac_id: "L1", platform: "kijiji", status: "live", external_url: "https://k/1" },
        ],
        bot_event: [
          { ts: "2026-06-22T11:00:00Z", lespac_id: "L1", platform: "facebook", action: "create", outcome: "failed", detail: { screenshotPath: "/s/fb-L1.png" } },
        ],
      });

      const data = await fetchBotDashboard(supabase);

      // sessions: facebook dead, kijiji unknown (no row)
      expect(data.sessions).toEqual([
        { platform: "facebook", health: "dead", lastValidatedAt: "2026-06-22T10:00:00Z" },
        { platform: "kijiji", health: "unknown", lastValidatedAt: null },
      ]);
      // board row with per-platform chips
      expect(data.board[0].lespacId).toBe("L1");
      expect(data.board[0].thumbnailUrl).toBe("p.jpg");
      expect(data.board[0].platforms.facebook).toEqual({ status: "failed", url: null });
      expect(data.board[0].platforms.kijiji).toEqual({ status: "live", url: "https://k/1" });
      // attention: dead session + failed publication (with screenshot)
      expect(data.attention.some((a) => a.kind === "session" && a.platform === "facebook")).toBe(true);
      const failed = data.attention.find((a) => a.kind === "failed" && a.lespacId === "L1");
      expect(failed?.screenshotUrl).toContain("fb-L1.png");
      // last/next sync derived from bot_event
      expect(data.lastSyncAt).toBe("2026-06-22T11:00:00Z");
      expect(data.nextSyncAt).toBe(new Date(Date.parse("2026-06-22T11:00:00Z") + 3600_000).toISOString());
    });
  });
  ```
- [ ] `pnpm test tests/unit/bot-dashboard-queries.test.ts` → **FAIL**.
- [ ] Implement `lib/bot/dashboard-queries.ts`:
  ```ts
  import type { SupabaseClient } from "@supabase/supabase-js";
  import { createAdminClient } from "@/lib/supabase/admin";
  import { loadBotConfig } from "@/lib/bot/config";
  import type { Platform, PublicationRow } from "@/lib/bot/types";

  export interface SessionHealth {
    platform: Platform;
    health: "ok" | "dead" | "unknown";
    lastValidatedAt: string | null;
  }
  export interface ListingBoardRow {
    lespacId: string;
    title: string;
    priceCad: number | null;
    thumbnailUrl: string | null;
    status: "active" | "gone";
    platforms: Record<Platform, { status: PublicationRow["status"]; url: string | null } | null>;
  }
  export interface AttentionItem {
    kind: "session" | "failed" | "duplicate";
    platform: Platform;
    lespacId: string | null;
    message: string;
    screenshotUrl: string | null;
  }
  export interface ActivityEntry {
    ts: string;
    lespacId: string | null;
    platform: Platform | null;
    action: string;
    outcome: string;
    detail: string | null;
  }
  export interface BotDashboardData {
    sessions: SessionHealth[];
    board: ListingBoardRow[];
    attention: AttentionItem[];
    activity: ActivityEntry[];
    lastSyncAt: string | null;
    nextSyncAt: string | null;
  }

  const ACTIVITY_LIMIT = 50;

  type SessionRow = { platform: string; health: string; last_validated_at: string | null };
  type ListingRow = {
    lespac_id: string; title: string | null; price_cad: number | null;
    photo_urls: string[] | null; status: "active" | "gone";
  };
  type PubRow = {
    lespac_id: string; platform: string; status: PublicationRow["status"];
    external_url: string | null; attempt_count?: number | null;
  };
  type EventRow = {
    ts: string; lespac_id: string | null; platform: string | null;
    action: string; outcome: string; detail: Record<string, unknown> | null;
  };

  export async function fetchBotDashboard(
    client?: SupabaseClient,
  ): Promise<BotDashboardData> {
    const supabase = client ?? createAdminClient();
    const cfg = loadBotConfig();

    const [sessRes, listRes, pubRes, evtRes] = await Promise.all([
      supabase.from("platform_session").select("platform, health, last_validated_at"),
      supabase
        .from("lespac_listing")
        .select("lespac_id, title, price_cad, photo_urls, status")
        .in("status", ["active", "gone"])
        .order("last_seen", { ascending: false }),
      supabase
        .from("platform_publication")
        .select("lespac_id, platform, status, external_url, attempt_count"),
      supabase
        .from("bot_event")
        .select("ts, lespac_id, platform, action, outcome, detail")
        .order("ts", { ascending: false })
        .limit(ACTIVITY_LIMIT),
    ]);

    const sessRows = (sessRes.data ?? []) as SessionRow[];
    const listRows = (listRes.data ?? []) as ListingRow[];
    const pubRows = (pubRes.data ?? []) as PubRow[];
    const evtRows = (evtRes.data ?? []) as EventRow[];

    const sessionByPlatform = new Map(sessRows.map((s) => [s.platform, s]));
    const sessions: SessionHealth[] = cfg.enabledPlatforms.map((platform) => {
      const row = sessionByPlatform.get(platform);
      const health =
        row?.health === "ok" || row?.health === "dead" ? row.health : "unknown";
      return { platform, health, lastValidatedAt: row?.last_validated_at ?? null };
    });

    const pubByListing = new Map<string, PubRow[]>();
    for (const p of pubRows) {
      const arr = pubByListing.get(p.lespac_id) ?? [];
      arr.push(p);
      pubByListing.set(p.lespac_id, arr);
    }

    const screenshotByKey = new Map<string, string>();
    for (const e of evtRows) {
      const shot = e.detail?.screenshotPath as string | undefined;
      if (shot && e.lespac_id && e.platform) {
        const key = `${e.lespac_id}:${e.platform}`;
        if (!screenshotByKey.has(key)) screenshotByKey.set(key, shot);
      }
    }

    const board: ListingBoardRow[] = listRows.map((l) => {
      const platforms = Object.fromEntries(
        cfg.enabledPlatforms.map((platform) => {
          const pub = (pubByListing.get(l.lespac_id) ?? []).find((p) => p.platform === platform);
          return [platform, pub ? { status: pub.status, url: pub.external_url } : null];
        }),
      ) as ListingBoardRow["platforms"];
      return {
        lespacId: l.lespac_id,
        title: l.title ?? l.lespac_id,
        priceCad: l.price_cad,
        thumbnailUrl: l.photo_urls?.[0] ?? null,
        status: l.status,
        platforms,
      };
    });

    const attention: AttentionItem[] = [];
    for (const s of sessions) {
      if (s.health === "dead") {
        attention.push({
          kind: "session", platform: s.platform, lespacId: null,
          message: `Session ${s.platform} morte — ré-authentification requise`,
          screenshotUrl: null,
        });
      }
    }
    for (const p of pubRows) {
      if (p.status === "failed") {
        attention.push({
          kind: "failed", platform: p.platform as Platform, lespacId: p.lespac_id,
          message: `Échec ${p.platform} sur ${p.lespac_id} (${p.attempt_count ?? 0} tentatives)`,
          screenshotUrl: screenshotByKey.get(`${p.lespac_id}:${p.platform}`) ?? null,
        });
      }
    }

    const activity: ActivityEntry[] = evtRows.map((e) => ({
      ts: e.ts,
      lespacId: e.lespac_id,
      platform: (e.platform as Platform | null) ?? null,
      action: e.action,
      outcome: e.outcome,
      detail: e.detail ? JSON.stringify(e.detail) : null,
    }));

    const lastSyncAt = evtRows[0]?.ts ?? null;
    const nextSyncAt = lastSyncAt
      ? new Date(Date.parse(lastSyncAt) + cfg.syncIntervalSec * 1000).toISOString()
      : null;

    return { sessions, board, attention, activity, lastSyncAt, nextSyncAt };
  }
  ```
- [ ] `pnpm test tests/unit/bot-dashboard-queries.test.ts` → **PASS**.
- [ ] `pnpm lint && pnpm typecheck`.
- [ ] Commit: `feat(bot): dashboard queries + shaping`.

---

### Task 6 — Dashboard server actions (`app/dashboard/bot/actions.ts`)

**Files**
- Create: `app/dashboard/bot/actions.ts`

**Interfaces**

Produces:
```ts
"use server";
export async function syncNow(): Promise<{ ok: boolean; message: string }>;
export async function uploadSession(
  platform: Platform,
  file: File,
): Promise<{ ok: boolean; message: string }>;
```

Consumes: `requireAllowedUser` (auth gate — same as every dashboard route),
`loadBotConfig` (sessions dir + platform allow-list), `createAdminClient`,
Node `child_process.spawn`, `node:fs/promises`.

**How `syncNow()` triggers a cycle:** it spawns the compiled one-shot worker as
a **detached** child process — `spawn("node", ["-r","tsconfig-paths/register",
"worker/dist/worker/run-once.js"], { detached: true, stdio: "ignore" })` — then
`unref()`s it and returns immediately. The web request does **not** block on the
(minutes-long, browser-driven) cycle; the operator watches progress refresh into
the read-only board + activity timeline. This reuses the exact same code path as
`pnpm bot:cycle`, so "Sync now" and the scheduler can never diverge. (The worker
build must exist; the action surfaces a clear error if `worker/dist` is missing.)

**Steps**

- [ ] Implement `app/dashboard/bot/actions.ts`:
  ```ts
  "use server";

  import { spawn } from "node:child_process";
  import { mkdir, writeFile } from "node:fs/promises";
  import path from "node:path";
  import { existsSync } from "node:fs";
  import { revalidatePath } from "next/cache";
  import { requireAllowedUser } from "@/lib/auth/require-user";
  import { loadBotConfig, ALL_PLATFORMS } from "@/lib/bot/config";
  import type { Platform } from "@/lib/bot/types";

  const RUN_ONCE = "worker/dist/worker/run-once.js";

  export async function syncNow(): Promise<{ ok: boolean; message: string }> {
    await requireAllowedUser();
    const entry = path.join(process.cwd(), RUN_ONCE);
    if (!existsSync(entry)) {
      return { ok: false, message: "Worker non compilé — lancer `pnpm bot:build`." };
    }
    const child = spawn("node", ["-r", "tsconfig-paths/register", entry], {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      env: process.env,
    });
    child.unref();
    revalidatePath("/dashboard/bot");
    return { ok: true, message: "Cycle de sync lancé en arrière-plan." };
  }

  export async function uploadSession(
    platform: Platform,
    file: File,
  ): Promise<{ ok: boolean; message: string }> {
    await requireAllowedUser();
    if (!(ALL_PLATFORMS as readonly string[]).includes(platform)) {
      return { ok: false, message: `Plateforme inconnue: ${platform}` };
    }
    if (!file || file.size === 0) {
      return { ok: false, message: "Fichier de session vide." };
    }
    const text = await file.text();
    try {
      JSON.parse(text); // storageState must be valid JSON
    } catch {
      return { ok: false, message: "Le fichier n'est pas un storageState JSON valide." };
    }
    const { sessionsDir } = loadBotConfig();
    await mkdir(sessionsDir, { recursive: true });
    await writeFile(path.join(sessionsDir, `${platform}.json`), text, "utf8");
    revalidatePath("/dashboard/bot");
    return { ok: true, message: `Session ${platform} mise à jour.` };
  }
  ```
- [ ] `pnpm lint && pnpm typecheck`.
- [ ] Commit: `feat(bot): dashboard server actions (syncNow, uploadSession)`.

---

### Task 7 — Dashboard client controls (`app/dashboard/bot/bot-controls.tsx`)

**Files**
- Create: `app/dashboard/bot/bot-controls.tsx`

**Interfaces**

Produces a client component:
```ts
export default function BotControls(props: {
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  platforms: Platform[];
}): JSX.Element;
```
Consumes: `syncNow`, `uploadSession` server actions.

**Steps**

- [ ] Implement `app/dashboard/bot/bot-controls.tsx` (mirror the
  `meta-actions.tsx` `useTransition` + message pattern):
  ```tsx
  "use client";

  import { useRef, useState, useTransition } from "react";
  import { useRouter } from "next/navigation";
  import type { Platform } from "@/lib/bot/types";
  import { syncNow, uploadSession } from "./actions";

  export default function BotControls({
    lastSyncAt,
    nextSyncAt,
    platforms,
  }: {
    lastSyncAt: string | null;
    nextSyncAt: string | null;
    platforms: Platform[];
  }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [message, setMessage] = useState<string | null>(null);
    const [platform, setPlatform] = useState<Platform>(platforms[0] ?? "facebook");
    const fileRef = useRef<HTMLInputElement>(null);

    function doSync() {
      setMessage(null);
      startTransition(async () => {
        const res = await syncNow();
        setMessage(res.message);
        if (res.ok) router.refresh();
      });
    }

    function doUpload() {
      const file = fileRef.current?.files?.[0];
      if (!file) {
        setMessage("Choisir un fichier sessions/<platform>.json.");
        return;
      }
      setMessage(null);
      startTransition(async () => {
        const res = await uploadSession(platform, file);
        setMessage(res.message);
        if (res.ok) {
          if (fileRef.current) fileRef.current.value = "";
          router.refresh();
        }
      });
    }

    const fmt = (v: string | null) =>
      v ? new Intl.DateTimeFormat("fr-CA", { dateStyle: "short", timeStyle: "short" }).format(new Date(v)) : "—";

    return (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="text-sm text-slate-600">
          <div>Dernière sync : <span className="font-medium text-slate-900">{fmt(lastSyncAt)}</span></div>
          <div>Prochaine sync : <span className="font-medium text-slate-900">{fmt(nextSyncAt)}</span></div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={doSync}
            disabled={pending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Synchroniser maintenant
          </button>
          <div className="flex items-center gap-2">
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
              className="rounded-md border border-slate-300 px-2 py-2 text-sm"
            >
              {platforms.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <input ref={fileRef} type="file" accept="application/json" className="text-sm" />
            <button
              type="button"
              onClick={doUpload}
              disabled={pending}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              Ré-uploader session
            </button>
          </div>
        </div>
        {message && (
          <p className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 sm:w-auto">
            {message}
          </p>
        )}
      </div>
    );
  }
  ```
- [ ] `pnpm lint && pnpm typecheck`.
- [ ] Commit: `feat(bot): dashboard controls client component`.

---

### Task 8 — Dashboard page (`app/dashboard/bot/page.tsx`)

Thin server component: auth gate → `fetchBotDashboard()` → render. Follows the
existing dashboard auth/page pattern (`requireAllowedUser`, `AppHeader`,
`export const dynamic = "force-dynamic"`).

**Files**
- Create: `app/dashboard/bot/page.tsx`

**Interfaces**
Consumes: `requireAllowedUser`, `fetchBotDashboard`, `loadBotConfig`,
`BotControls`.

**Steps**

- [ ] Implement `app/dashboard/bot/page.tsx`:
  ```tsx
  import Link from "next/link";
  import AppHeader from "@/app/app-header";
  import { requireAllowedUser } from "@/lib/auth/require-user";
  import { fetchBotDashboard } from "@/lib/bot/dashboard-queries";
  import { loadBotConfig } from "@/lib/bot/config";
  import type { Platform } from "@/lib/bot/types";
  import BotControls from "./bot-controls";

  export const dynamic = "force-dynamic";

  const priceFmt = new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

  export default async function BotDashboardPage() {
    const user = await requireAllowedUser();
    const cfg = loadBotConfig();
    const data = await fetchBotDashboard();

    return (
      <main className="min-h-screen bg-slate-50 text-slate-950">
        <AppHeader
          title="Bot"
          right={
            <Link href="/dashboard" className="text-xs text-white/70 hover:text-white">
              ← Tableau de bord
            </Link>
          }
        />

        <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
          {/* 1. Session health banner */}
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-medium text-slate-500">Sessions</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {data.sessions.map((s) => (
                <span
                  key={s.platform}
                  className={
                    "rounded-md px-3 py-1 text-sm font-semibold " +
                    (s.health === "ok"
                      ? "bg-emerald-100 text-emerald-800"
                      : s.health === "dead"
                        ? "bg-red-100 text-red-800"
                        : "bg-slate-100 text-slate-600")
                  }
                >
                  {s.platform} {s.health === "ok" ? "✓" : s.health === "dead" ? "✗ ré-auth" : "?"}
                </span>
              ))}
            </div>
          </section>

          {/* 2. Needs your attention */}
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-950">À régler</h2>
            {data.attention.length === 0 ? (
              <p className="mt-2 text-sm text-emerald-700">Rien à signaler.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {data.attention.map((a, i) => (
                  <li
                    key={`${a.kind}-${a.platform}-${a.lespacId ?? i}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                  >
                    <span>{a.message}</span>
                    {a.screenshotUrl && (
                      <a
                        href={`/dashboard/bot/screenshot?path=${encodeURIComponent(a.screenshotUrl)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 rounded border border-amber-300 bg-white px-2 py-1 text-xs font-medium hover:bg-amber-100"
                      >
                        Capture
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 3. Listings board */}
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-950">Annonces</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="py-2 pr-3">Annonce</th>
                    <th className="py-2 pr-3">Prix</th>
                    {cfg.enabledPlatforms.map((p) => (
                      <th key={p} className="py-2 pr-3">{p}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.board.map((row) => (
                    <tr key={row.lespacId} className="border-t border-slate-100">
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {row.thumbnailUrl && (
                            <img src={row.thumbnailUrl} alt="" className="h-10 w-14 rounded object-cover" />
                          )}
                          <span className="font-medium text-slate-900">{row.title}</span>
                          {row.status === "gone" && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">vendu</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-3 font-mono text-slate-700">
                        {row.priceCad ? priceFmt.format(row.priceCad) : "—"}
                      </td>
                      {cfg.enabledPlatforms.map((p) => (
                        <td key={p} className="py-2 pr-3">
                          <StatusChip cell={row.platforms[p as Platform]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 4. Recent activity */}
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-950">Activité récente</h2>
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              {data.activity.map((e, i) => (
                <li key={`${e.ts}-${i}`} className="flex gap-2">
                  <span className="font-mono text-xs text-slate-400">
                    {new Intl.DateTimeFormat("fr-CA", { dateStyle: "short", timeStyle: "short" }).format(new Date(e.ts))}
                  </span>
                  <span>
                    {e.platform ?? "—"} · {e.action} · {e.outcome}
                    {e.lespacId ? ` · ${e.lespacId}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* 5. Footer controls */}
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <BotControls
              lastSyncAt={data.lastSyncAt}
              nextSyncAt={data.nextSyncAt}
              platforms={cfg.enabledPlatforms}
            />
          </section>

          <p className="px-1 text-xs text-slate-400">Connecté : {user.email}</p>
        </div>
      </main>
    );
  }

  function StatusChip({ cell }: { cell: { status: string; url: string | null } | null }) {
    if (!cell) return <span className="text-xs text-slate-400">—</span>;
    const tone =
      cell.status === "live"
        ? "bg-emerald-100 text-emerald-800"
        : cell.status === "failed"
          ? "bg-red-100 text-red-800"
          : cell.status === "removed"
            ? "bg-slate-100 text-slate-500"
            : "bg-amber-100 text-amber-800";
    const chip = (
      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${tone}`}>{cell.status}</span>
    );
    return cell.url ? (
      <a href={cell.url} target="_blank" rel="noreferrer" className="hover:underline">{chip}</a>
    ) : chip;
  }
  ```
  > The screenshot link points at a small authenticated route
  > `app/dashboard/bot/screenshot/route.ts` that streams a file from
  > `screenshotsDir` (guard against path traversal — resolve + assert the file is
  > inside `screenshotsDir`). That route is a thin add owned here if needed; if
  > the screenshot files are uploaded to Supabase storage instead, swap the href
  > to a signed URL. Implementer picks based on where the harness writes shots.
- [ ] `pnpm typecheck`.
- [ ] `pnpm build` (page must compile under Next 16; confirms `force-dynamic`
  server component + client child wire up). 
- [ ] Manual smoke: `pm2 restart pacman`, hit `/dashboard/bot` while logged in —
  banner, board, activity, and the two buttons render.
- [ ] Commit: `feat(bot): read-only bot dashboard page`.

---

### Cross-cutting notes for the implementer

- **`bot_event.platform`/`lespac_id` nullable** — `alert` events have neither;
  the migration (owned by the data-model part) must allow NULLs there.
- **`recordResult` payload** — align field names in `runJob` with
  `mirror-state`'s `RecordResultInput`; tests only assert `status`/`attemptCount`.
- **No browser in unit tests** — every Playwright/network/DB dependency of
  `runCycle` and the queries is mocked; CI never launches Chromium.
- **Commit trailers** — every commit ends with:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
  ```
