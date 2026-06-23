# Bot Config UI (Tailnet) — Design

**Date:** 2026-06-23
**Status:** Approved design, pending implementation plan
**Builds on:** `docs/superpowers/specs/2026-06-22-lespac-mirror-bot-design.md` (the mirror bot, now merged to `main`).

## Goal

Give the non-savvy operator a **simple web interface to configure the mirror bot** — the values currently set via env vars (`OPERATOR_EMAIL`, enabled platforms, sync frequency, per-cycle cap, posting pace). No SSH, no `.env` editing. Reachable privately over the dealer's Tailscale tailnet. Simple and autonomous — set the few knobs, the bot runs itself.

Everything else about the bot stays as already built and merged. This adds only: a settings page, DB-backed live config, tailnet-only access, and removal of the now-pointless login.

## Non-goals

- No "advanced" mode, no power-user knobs, no raw-number editing of pace/interval (friendly choices only).
- No changes to the bot engine, drivers, reconciler, or the existing `/dashboard/bot` operations (status board, sync-now, session upload) — those stay exactly as built.
- Infra values (`sessionsDir`, `screenshotsDir`, `maxAttempts`) remain env-only — not user-editable.

## Section 1 — Access & auth (tailnet = the gate)

Security rests on two enforced layers; both must hold.

1. **Bind the app to localhost.** Change the pm2 `pacman` app from `next start -H 0.0.0.0` to `-H 127.0.0.1 -p 3005`. The app is then unreachable on the LAN/tailnet IP directly — the only ingress is a local proxy.
2. **Tailscale `serve` is that proxy, tailnet-only.**
   - **Turn Funnel OFF first** (it is currently ON — public — from the old feed setup): `tailscale funnel --https=443 off` (and any other Funnel ports: 8443, 10000). This MUST happen before login is removed, or the app would be public with no auth.
   - Configure serve: `tailscale serve --bg --https=443 127.0.0.1:3005`. Tailscale terminates TLS with a real cert; the app is reachable only by tailnet devices at `https://hino1-thinkcentre-m93p.tail0e1ea8.ts.net`.
3. **Drop the magic-link login.** With tailnet membership as the gate, `proxy.ts` stops enforcing a Supabase session. `requireAllowedUser()` (used in the bot page, actions, screenshot route) is replaced with a trivial allow that optionally reads Tailscale's `Tailscale-User-Login` request header — used only to stamp *who* changed a setting.

**Trade-off (explicit):** after this the app has no application-layer auth; security is the 127.0.0.1 bind + tailnet + Funnel-off. Reverting the bind to `0.0.0.0` or re-enabling Funnel would expose it. These are documented as the committed defaults with a loud warning. This is the right model for a private single-operator tool; it is a deliberate posture change.

### Auth-removal cleanup (deletions)

Once login is gone, these become dead and are removed:
- `app/login/` (page + actions), `lib/auth/actions.ts`, `lib/auth/whitelist.ts`.
- `app/dashboard/users/` (managing whitelisted users is moot without login) + the `app_user` whitelist usage.
- The session-enforcement in `lib/supabase/middleware.ts` / `proxy.ts` — simplified to a pass-through (or proxy removed).
- `lib/auth/require-user.ts` → replaced by a tiny `currentEditor()` helper that returns the Tailscale identity header (or "operator") for `updated_by` stamping.

Kept: `lib/graph/mail.ts` (still used for operator alert emails), the Supabase **admin** client (the app now talks to Supabase only via service_role, since there is no logged-in user), `lib/supabase/client.ts`/`server.ts` only if still referenced after cleanup.

## Section 2 — Config storage & DB-aware loading

**Table `bot_setting`** — a single seeded row (singleton) holding the user-editable settings:
```
id            int PRIMARY KEY DEFAULT 1 CHECK (id = 1)   -- singleton
enabled_platforms  text[] NOT NULL DEFAULT ARRAY['facebook']
sync_interval_sec  int    NOT NULL DEFAULT 3600
operator_email     text   NOT NULL DEFAULT ''
max_jobs_per_cycle int    NOT NULL DEFAULT 8
pace_min_ms        int    NOT NULL DEFAULT 4000
pace_max_ms        int    NOT NULL DEFAULT 12000
updated_by         text
updated_at         timestamptz NOT NULL DEFAULT now()
```
The migration seeds row `id = 1` from the current env defaults, so the form always has values and nothing breaks before the first save. RLS: authenticated full access (admin client bypasses); no anon. CHECK constraints: `sync_interval_sec >= 300`, `pace_min_ms >= 0`, `pace_max_ms >= pace_min_ms`, `max_jobs_per_cycle between 1 and 100`.

**Loading becomes DB-aware.** Add `export async function getBotConfig(supabase): Promise<BotConfig>` that computes the existing env defaults (`loadBotConfig()` stays as the pure env-default layer) and overlays the `bot_setting` row — DB value wins where present, env is the fallback. Updated call sites:
- **`runCycle`** (`lib/bot/cycle.ts`, already async, already has the admin client) → `await getBotConfig(supabase)` each cycle. Platform/email/pace/cap edits apply on the next cycle automatically.
- **scheduler loop** (`worker/index.ts`) → `await getBotConfig(...)` each iteration before sleeping, so a sync-interval change applies without a restart.
- **dashboard queries** → read via admin client.

**Validation** — a shared Zod schema (`lib/bot/settings-schema.ts`): ≥1 enabled platform, `sync_interval_sec` from an allowed set, valid email (or empty), `max_jobs_per_cycle` 1–100, `pace_min_ms < pace_max_ms`. Used by both the save action and the form.

## Section 3 — The settings UI

A dedicated **`/dashboard/bot/settings`** page (server component, French, linked from `/dashboard/bot`). Friendly choices, never raw numbers:

- **Plateformes** — checkboxes. Facebook toggleable; Kijiji + AutoTrader shown disabled with "bientôt" (stubs).
- **Fréquence de synchronisation** — dropdown ("Aux heures" → 3600, "Aux 3 heures" → 10800, "2× par jour" → 43200, "1× par jour" → 86400) mapping to `sync_interval_sec`.
- **Courriel d'alerte** — `operator_email` input, helper "où le bot t'avertit s'il est bloqué".
- **Max d'annonces par cycle** — number, helper "évite les blocages de compte".
- **Rythme de publication** — "Prudent / Normal" choice mapping to `pace_min_ms`/`pace_max_ms`.

**Flow:** the page loads `bot_setting` via the admin client and renders a client form (same `useTransition` pattern as `bot-controls.tsx`). Save → `saveBotSettings` server action → Zod-validate → write via admin client (stamp `updated_by` from `currentEditor()`, `updated_at`) → `revalidatePath`. Inline field errors; "Enregistré ✓" on success; a line "Dernière modif: <who> · <when>". A nav link to Settings is added on `/dashboard/bot`.

## File structure

- `supabase/migrations/20260623120000_bot_setting.sql` — table + seed + RLS + CHECKs.
- `lib/supabase/types.ts` — regenerate for `bot_setting`.
- `lib/bot/settings-schema.ts` — Zod schema + the interval/pace presentation maps.
- `lib/bot/config.ts` — add async `getBotConfig(supabase)` overlaying DB on env defaults.
- `lib/bot/cycle.ts`, `worker/index.ts`, `lib/bot/dashboard-queries.ts` — switch to `getBotConfig`.
- `app/dashboard/bot/settings/page.tsx` — settings page (server).
- `app/dashboard/bot/settings/settings-form.tsx` — client form.
- `app/dashboard/bot/settings/actions.ts` — `saveBotSettings` server action.
- `lib/auth/current-editor.ts` — `currentEditor()` reading the Tailscale identity header.
- `proxy.ts` / `lib/supabase/middleware.ts` — simplified pass-through (login gate removed).
- `ecosystem.config.cjs` — pacman app bind `-H 127.0.0.1`.
- `docs/setup-tailscale-serve.md` — operator runbook: Funnel off, serve on, verify tailnet-only.
- **Deletions:** `app/login/`, `app/dashboard/users/`, `lib/auth/actions.ts`, `lib/auth/whitelist.ts`, `lib/auth/require-user.ts` (replaced).

## Testing

- `getBotConfig` overlay logic — DB wins over env, missing row falls back to env defaults (unit, mocked supabase).
- Zod settings schema — valid/invalid cases (interval set, pace ordering, email, platform count).
- `saveBotSettings` action — validates + writes via admin client + stamps editor (mocked).
- Per AGENTS.md: lint + typecheck before each commit; the full suite stays green; `pnpm build` green with `/dashboard/bot/settings` in the route list.
- Manual/operator: Funnel-off + serve-on verification is an operator step (documented in the runbook), confirmed from a second tailnet device and from a non-tailnet network (must be unreachable).

## Build order

1. DB: `bot_setting` migration + seed + types.
2. Config: `getBotConfig` + switch call sites + schema.
3. UI: settings page + form + save action + nav link.
4. Access: localhost bind + Funnel-off/serve runbook + identity helper.
5. Cleanup: remove login/users/auth, simplify proxy.

Access (4) and cleanup (5) land last and together, so the app is never left publicly reachable without login mid-way.
