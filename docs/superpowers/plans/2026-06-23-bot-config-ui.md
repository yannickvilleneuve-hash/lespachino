# Bot Config UI (Tailnet) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A simple tailnet-only web UI to configure the mirror bot (operator email, platforms, sync frequency, per-cycle cap, posting pace), backed by live DB config, with the magic-link login removed (tailnet is the gate).

**Architecture:** A singleton `bot_setting` row in Supabase holds the editable config; an async `getBotConfig(supabase)` overlays it on the existing env defaults. A `/dashboard/bot/settings` page (admin-client, no login) edits it. The app binds to `127.0.0.1` and is exposed tailnet-only via `tailscale serve` (Funnel off); the magic-link auth is deleted.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase Postgres/RLS, Zod, Vitest, Tailscale.

## Global Constraints

- Builds on the merged mirror bot (`main`). Do NOT change the bot engine/drivers/reconciler behaviour or the existing `/dashboard/bot` operations.
- **Real env var names** (do not invent): `BOT_PLATFORMS`, `SYNC_INTERVAL`, `MAX_JOBS_PER_CYCLE`, `MAX_ATTEMPTS`, `OPERATOR_EMAIL`, `BOT_SESSIONS_DIR`, `BOT_SCREENSHOTS_DIR`, `BOT_PACE_MIN_MS`, `BOT_PACE_MAX_MS`.
- Infra config (`sessionsDir`, `screenshotsDir`, `maxAttempts`) stays env-only — NOT user-editable.
- After auth removal, the app talks to Supabase only via `createAdminClient()` (service_role). RLS on new table: `authenticated` full access, no `anon`.
- French UI copy, friendly choices (no raw seconds/ms shown to the user).
- Security ordering: **Funnel off + `serve` on + `127.0.0.1` bind land BEFORE login removal** — the app must never be publicly reachable without auth mid-migration. Tasks 5 and 6 are last and in that order.
- `pnpm lint` + `pnpm typecheck` green before every commit; full vitest suite stays green; commit messages end with:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
  ```

## File Structure

- `supabase/migrations/20260623120000_bot_setting.sql` — singleton table + seed + RLS + CHECKs.
- `lib/supabase/types.ts` — regenerated for `bot_setting`.
- `lib/bot/settings-schema.ts` — Zod schema + interval/pace presentation maps.
- `lib/bot/config.ts` — `paceMinMs`/`paceMaxMs` added to `BotConfig` + `loadBotConfig`; new async `getBotConfig(supabase)`.
- `lib/bot/cycle.ts`, `worker/index.ts`, `lib/bot/dashboard-queries.ts` — consume `getBotConfig`; inter-job pace uses config.
- `lib/bot/harness.ts` — `pace()` accepts optional `(minMs, maxMs)`.
- `lib/auth/current-editor.ts` — `currentEditor()` reading the Tailscale identity header.
- `app/dashboard/bot/settings/{page.tsx,settings-form.tsx,actions.ts}` — the UI.
- `ecosystem.config.cjs` — `pacman` app bind `-H 127.0.0.1`.
- `docs/setup-tailscale-serve.md` — operator runbook.
- `proxy.ts`, `lib/supabase/middleware.ts` — simplified pass-through after login removal.
- Deletions: `app/login/`, `app/dashboard/users/`, `lib/auth/actions.ts`, `lib/auth/whitelist.ts`, `lib/auth/require-user.ts`.

---

## Task 1: `bot_setting` table + seed + types

**Files:**
- Create: `supabase/migrations/20260623120000_bot_setting.sql`
- Modify: `lib/supabase/types.ts`

**Interfaces:**
- Produces: table `bot_setting` (singleton row `id=1`) with columns `enabled_platforms text[]`, `sync_interval_sec int`, `operator_email text`, `max_jobs_per_cycle int`, `pace_min_ms int`, `pace_max_ms int`, `updated_by text`, `updated_at timestamptz`.

- [ ] **Step 1: Write the migration.** Create `supabase/migrations/20260623120000_bot_setting.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.bot_setting (
  id                 int PRIMARY KEY DEFAULT 1,
  enabled_platforms  text[] NOT NULL DEFAULT ARRAY['facebook']::text[],
  sync_interval_sec  int NOT NULL DEFAULT 3600,
  operator_email     text NOT NULL DEFAULT '',
  max_jobs_per_cycle int NOT NULL DEFAULT 8,
  pace_min_ms        int NOT NULL DEFAULT 4000,
  pace_max_ms        int NOT NULL DEFAULT 12000,
  updated_by         text,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bot_setting_singleton CHECK (id = 1),
  CONSTRAINT bot_setting_interval_valid CHECK (sync_interval_sec >= 300),
  CONSTRAINT bot_setting_cap_valid CHECK (max_jobs_per_cycle BETWEEN 1 AND 100),
  CONSTRAINT bot_setting_pace_valid CHECK (pace_min_ms >= 0 AND pace_max_ms >= pace_min_ms)
);

DROP TRIGGER IF EXISTS bot_setting_touch ON public.bot_setting;
CREATE TRIGGER bot_setting_touch
  BEFORE UPDATE ON public.bot_setting
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.bot_setting ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bot_setting_auth_all ON public.bot_setting;
CREATE POLICY bot_setting_auth_all ON public.bot_setting
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.bot_setting (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 2: Apply the migration.** Load the MCP tool: `ToolSearch` query `select:mcp__plugin_supabase_supabase__apply_migration,mcp__plugin_supabase_supabase__list_tables`. Call `apply_migration` on project `aelrhiiehtrwkblfrozf` with name `bot_setting` and the SQL above. Then `list_tables` and confirm `bot_setting` exists with the singleton row.
  Expected: apply succeeds; `bot_setting` present.

- [ ] **Step 3: Regenerate types.** `ToolSearch` query `select:mcp__plugin_supabase_supabase__generate_typescript_types`; call it for project `aelrhiiehtrwkblfrozf`; write the output to `lib/supabase/types.ts` (replacing the file). Run `pnpm exec tsc --noEmit`.
  Expected: exit 0; `bot_setting` present in the types (`grep bot_setting lib/supabase/types.ts`).

- [ ] **Step 4: Commit.**
```bash
git add supabase/migrations/20260623120000_bot_setting.sql lib/supabase/types.ts
git commit -m "$(cat <<'EOF'
feat(config): add bot_setting singleton table

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
EOF
)"
```

---

## Task 2: Settings schema + DB-aware config loader

**Files:**
- Create: `lib/bot/settings-schema.ts`
- Create: `tests/unit/bot-settings-schema.test.ts`
- Modify: `lib/bot/config.ts`
- Create: `tests/unit/bot-get-config.test.ts`

**Interfaces:**
- Consumes: `loadBotConfig()`, `BotConfig`, `ALL_PLATFORMS`, `Platform` from `lib/bot/config.ts`/`lib/bot/types.ts`; `bot_setting` table (Task 1).
- Produces:
  - `lib/bot/settings-schema.ts`: `export const SYNC_INTERVAL_CHOICES` (array of `{ value: number; label: string }`), `export const PACE_CHOICES` (`{ value: "prudent"|"normal"; minMs: number; maxMs: number; label: string }[]`), `export const botSettingsSchema` (Zod), `export type BotSettingsInput = z.infer<typeof botSettingsSchema>`.
  - `lib/bot/config.ts`: `BotConfig` gains `paceMinMs: number; paceMaxMs: number;`; `export async function getBotConfig(supabase: SupabaseClient<Database>): Promise<BotConfig>`.

- [ ] **Step 1: Write the schema test.** Create `tests/unit/bot-settings-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { botSettingsSchema } from "@/lib/bot/settings-schema";

describe("botSettingsSchema", () => {
  const valid = {
    enabledPlatforms: ["facebook"],
    syncIntervalSec: 3600,
    operatorEmail: "ops@example.com",
    maxJobsPerCycle: 8,
    paceMinMs: 4000,
    paceMaxMs: 12000,
  };

  it("accepts a valid payload", () => {
    expect(botSettingsSchema.safeParse(valid).success).toBe(true);
  });
  it("accepts an empty operator email", () => {
    expect(botSettingsSchema.safeParse({ ...valid, operatorEmail: "" }).success).toBe(true);
  });
  it("rejects an invalid email", () => {
    expect(botSettingsSchema.safeParse({ ...valid, operatorEmail: "nope" }).success).toBe(false);
  });
  it("rejects zero enabled platforms", () => {
    expect(botSettingsSchema.safeParse({ ...valid, enabledPlatforms: [] }).success).toBe(false);
  });
  it("rejects pace_max < pace_min", () => {
    expect(botSettingsSchema.safeParse({ ...valid, paceMinMs: 9000, paceMaxMs: 1000 }).success).toBe(false);
  });
  it("rejects an out-of-range cap", () => {
    expect(botSettingsSchema.safeParse({ ...valid, maxJobsPerCycle: 0 }).success).toBe(false);
  });
  it("rejects an unknown platform", () => {
    expect(botSettingsSchema.safeParse({ ...valid, enabledPlatforms: ["myspace"] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — verify it fails.** `pnpm exec vitest run tests/unit/bot-settings-schema.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write the schema.** Create `lib/bot/settings-schema.ts`:

```ts
import { z } from "zod";
import { ALL_PLATFORMS } from "@/lib/bot/config";

export const SYNC_INTERVAL_CHOICES = [
  { value: 3600, label: "Aux heures" },
  { value: 10800, label: "Aux 3 heures" },
  { value: 43200, label: "2× par jour" },
  { value: 86400, label: "1× par jour" },
] as const;

export const PACE_CHOICES = [
  { value: "prudent", minMs: 8000, maxMs: 20000, label: "Prudent" },
  { value: "normal", minMs: 4000, maxMs: 12000, label: "Normal" },
] as const;

export const botSettingsSchema = z.object({
  enabledPlatforms: z
    .array(z.enum(ALL_PLATFORMS as unknown as [string, ...string[]]))
    .min(1, "Au moins une plateforme."),
  syncIntervalSec: z.number().int().min(300),
  operatorEmail: z.union([z.string().email(), z.literal("")]),
  maxJobsPerCycle: z.number().int().min(1).max(100),
  paceMinMs: z.number().int().min(0),
  paceMaxMs: z.number().int().min(0),
}).refine((v) => v.paceMaxMs >= v.paceMinMs, {
  message: "Le rythme max doit être ≥ au min.",
  path: ["paceMaxMs"],
});

export type BotSettingsInput = z.infer<typeof botSettingsSchema>;
```

- [ ] **Step 4: Run it — verify it passes.** `pnpm exec vitest run tests/unit/bot-settings-schema.test.ts` → PASS (7 tests). Confirm `zod` is already a dependency (`grep '"zod"' package.json`); it is.

- [ ] **Step 5: Write the getBotConfig test.** Create `tests/unit/bot-get-config.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { getBotConfig } from "@/lib/bot/config";

function supabaseWith(row: Record<string, unknown> | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }),
      }),
    }),
  } as never;
}

describe("getBotConfig", () => {
  it("falls back to env defaults when no row exists", async () => {
    const cfg = await getBotConfig(supabaseWith(null));
    expect(cfg.syncIntervalSec).toBe(3600);
    expect(cfg.enabledPlatforms.length).toBeGreaterThan(0);
  });

  it("overlays DB values over env defaults", async () => {
    const cfg = await getBotConfig(
      supabaseWith({
        enabled_platforms: ["facebook"],
        sync_interval_sec: 10800,
        operator_email: "db@example.com",
        max_jobs_per_cycle: 5,
        pace_min_ms: 8000,
        pace_max_ms: 20000,
      }),
    );
    expect(cfg.syncIntervalSec).toBe(10800);
    expect(cfg.operatorEmail).toBe("db@example.com");
    expect(cfg.maxJobsPerCycle).toBe(5);
    expect(cfg.enabledPlatforms).toEqual(["facebook"]);
    expect(cfg.paceMinMs).toBe(8000);
    expect(cfg.paceMaxMs).toBe(20000);
  });
});
```

- [ ] **Step 6: Run it — verify it fails.** `pnpm exec vitest run tests/unit/bot-get-config.test.ts` → FAIL (`getBotConfig` not exported).

- [ ] **Step 7: Extend config.ts.** In `lib/bot/config.ts`: add `paceMinMs: number;` and `paceMaxMs: number;` to the `BotConfig` interface; in `loadBotConfig` add `paceMinMs: num(processEnv.BOT_PACE_MIN_MS, 4000),` and `paceMaxMs: num(processEnv.BOT_PACE_MAX_MS, 12000),` to the returned object. Then append:

```ts
import { createClient as createSupabase } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * Env defaults overlaid with the live `bot_setting` row (DB wins where set).
 * The worker and dashboard call this so config edits apply without a restart.
 */
export async function getBotConfig(
  supabase: SupabaseClient<Database>,
): Promise<BotConfig> {
  const base = loadBotConfig();
  const { data } = await supabase
    .from("bot_setting")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (!data) return base;
  const known = new Set<string>(ALL_PLATFORMS);
  const platforms = (data.enabled_platforms ?? []).filter((p): p is Platform =>
    known.has(p),
  );
  return {
    ...base,
    enabledPlatforms: platforms.length > 0 ? platforms : base.enabledPlatforms,
    syncIntervalSec: data.sync_interval_sec ?? base.syncIntervalSec,
    maxJobsPerCycle: data.max_jobs_per_cycle ?? base.maxJobsPerCycle,
    operatorEmail: data.operator_email ?? base.operatorEmail,
    paceMinMs: data.pace_min_ms ?? base.paceMinMs,
    paceMaxMs: data.pace_max_ms ?? base.paceMaxMs,
  };
}
```
(Remove the unused `createSupabase` import if not needed — only the types are required.)

- [ ] **Step 8: Run both tests + typecheck.** `pnpm exec vitest run tests/unit/bot-settings-schema.test.ts tests/unit/bot-get-config.test.ts` → PASS. `pnpm exec tsc --noEmit` → exit 0.

- [ ] **Step 9: Commit.**
```bash
git add lib/bot/settings-schema.ts lib/bot/config.ts tests/unit/bot-settings-schema.test.ts tests/unit/bot-get-config.test.ts
git commit -m "$(cat <<'EOF'
feat(config): add settings schema + DB-aware getBotConfig

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
EOF
)"
```

---

## Task 3: Consume live config in the engine

**Files:**
- Modify: `lib/bot/cycle.ts`, `worker/index.ts`, `lib/bot/dashboard-queries.ts`, `lib/bot/harness.ts`
- Modify: `tests/unit/bot-cycle.test.ts` (adjust for async config)

**Interfaces:**
- Consumes: `getBotConfig(supabase)` (Task 2), `createAdminClient()` from `@/lib/supabase/admin`.
- Produces: the cycle/scheduler/dashboard read live config; inter-job pacing uses `cfg.paceMinMs/paceMaxMs`.

- [ ] **Step 1: Make harness `pace` accept bounds.** In `lib/bot/harness.ts`, change `export function pace(): Promise<void>` to `export function pace(minMs?: number, maxMs?: number): Promise<void>` — use the args when provided, else fall back to the existing `BOT_PACE_MIN_MS`/`BOT_PACE_MAX_MS` env logic. Keep the existing harness tests green (call with no args still works).

- [ ] **Step 2: runCycle uses getBotConfig.** In `lib/bot/cycle.ts`: read `lib/bot/cycle.ts` first. Replace the `const cfg = loadBotConfig();` at the cycle entry (~line 242) with `const cfg = await getBotConfig(supabase);` (the admin client is already in scope as `supabase`). Change the inter-job pace call (`if (i > 0) await pace();`, ~line 286) to `if (i > 0) await pace(cfg.paceMinMs, cfg.paceMaxMs);` — thread `cfg` into the per-platform job loop function if needed (it already receives `cfg`). Import `getBotConfig` (drop the now-unused `loadBotConfig` import if nothing else uses it).

- [ ] **Step 3: Scheduler uses getBotConfig each iteration.** In `worker/index.ts`: read it first. Create an admin client once; inside the loop, before each sleep, `const cfg = await getBotConfig(supabase);` and sleep `cfg.syncIntervalSec * 1000`. So a sync-interval change applies on the next iteration without a restart.

- [ ] **Step 4: dashboard-queries uses getBotConfig.** In `lib/bot/dashboard-queries.ts`: where it currently calls `loadBotConfig()` for `enabledPlatforms`/`syncIntervalSec` (for `nextSyncAt`), switch to `await getBotConfig(supabase)` using the admin client it already builds.

- [ ] **Step 5: Fix the cycle test for async config.** In `tests/unit/bot-cycle.test.ts`: the test mocks `@/lib/bot/config`. Update the mock so `getBotConfig` is an async fn returning the test config (including `paceMinMs`/`paceMaxMs`), matching whatever `loadBotConfig` previously returned in the mock. Adjust any `pace` mock to accept args.

- [ ] **Step 6: Run the suite + typecheck.** `pnpm test` → all green. `pnpm exec tsc --noEmit` → exit 0. `pnpm bot:build` → worker still compiles.

- [ ] **Step 7: Commit.**
```bash
git add lib/bot/cycle.ts worker/index.ts lib/bot/dashboard-queries.ts lib/bot/harness.ts tests/unit/bot-cycle.test.ts
git commit -m "$(cat <<'EOF'
feat(config): read live bot_setting in cycle, scheduler, dashboard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
EOF
)"
```

---

## Task 4: Settings page + form + save action

**Files:**
- Create: `lib/auth/current-editor.ts`
- Create: `app/dashboard/bot/settings/actions.ts`
- Create: `app/dashboard/bot/settings/settings-form.tsx`
- Create: `app/dashboard/bot/settings/page.tsx`
- Create: `tests/unit/bot-settings-action.test.ts`
- Modify: `app/dashboard/bot/page.tsx` (add a nav link to Settings)

**Interfaces:**
- Consumes: `botSettingsSchema`, `SYNC_INTERVAL_CHOICES`, `PACE_CHOICES` (Task 2); `createAdminClient()`; `ALL_PLATFORMS`.
- Produces: `saveBotSettings(input)` server action; `currentEditor()` helper.

- [ ] **Step 1: currentEditor helper.** Create `lib/auth/current-editor.ts`:

```ts
import { headers } from "next/headers";

/** Who is editing — from Tailscale serve's identity header, else "operator". */
export async function currentEditor(): Promise<string> {
  const h = await headers();
  return h.get("tailscale-user-login") ?? "operator";
}
```

- [ ] **Step 2: Write the action test.** Create `tests/unit/bot-settings-action.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const update = vi.fn(() => ({ eq: () => Promise.resolve({ error: null }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ update }) }),
}));
vi.mock("@/lib/auth/current-editor", () => ({ currentEditor: () => Promise.resolve("tester") }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveBotSettings } from "@/app/dashboard/bot/settings/actions";

beforeEach(() => update.mockClear());

const valid = {
  enabledPlatforms: ["facebook"],
  syncIntervalSec: 3600,
  operatorEmail: "ops@example.com",
  maxJobsPerCycle: 8,
  paceMinMs: 4000,
  paceMaxMs: 12000,
};

describe("saveBotSettings", () => {
  it("writes valid settings via the admin client", async () => {
    const res = await saveBotSettings(valid);
    expect(res.ok).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    const payload = update.mock.calls[0][0];
    expect(payload.sync_interval_sec).toBe(3600);
    expect(payload.updated_by).toBe("tester");
  });

  it("rejects invalid input without writing", async () => {
    const res = await saveBotSettings({ ...valid, operatorEmail: "nope" });
    expect(res.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run it — verify it fails.** `pnpm exec vitest run tests/unit/bot-settings-action.test.ts` → FAIL (module not found).

- [ ] **Step 4: Write the action.** Create `app/dashboard/bot/settings/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentEditor } from "@/lib/auth/current-editor";
import { botSettingsSchema, type BotSettingsInput } from "@/lib/bot/settings-schema";

export async function saveBotSettings(
  input: BotSettingsInput,
): Promise<{ ok: boolean; message: string }> {
  const parsed = botSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Entrée invalide." };
  }
  const v = parsed.data;
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("bot_setting")
    .update({
      enabled_platforms: v.enabledPlatforms,
      sync_interval_sec: v.syncIntervalSec,
      operator_email: v.operatorEmail,
      max_jobs_per_cycle: v.maxJobsPerCycle,
      pace_min_ms: v.paceMinMs,
      pace_max_ms: v.paceMaxMs,
      updated_by: await currentEditor(),
    })
    .eq("id", 1);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard/bot/settings");
  return { ok: true, message: "Enregistré ✓" };
}
```

- [ ] **Step 5: Run it — verify it passes.** `pnpm exec vitest run tests/unit/bot-settings-action.test.ts` → PASS (2 tests).

- [ ] **Step 6: Write the client form.** Create `app/dashboard/bot/settings/settings-form.tsx` — a `"use client"` component (mirror `app/dashboard/bot/bot-controls.tsx`: `useState` + `useTransition`). Props: `initial: BotSettingsInput`. Renders: platform checkboxes (Facebook enabled; `kijiji`/`autotrader` rendered `disabled` with "bientôt"), a `<select>` of `SYNC_INTERVAL_CHOICES`, an email input, a number input for `maxJobsPerCycle`, and a `<select>` of `PACE_CHOICES` (map the chosen pace to `paceMinMs`/`paceMaxMs` on submit). On submit, build a `BotSettingsInput` and call `saveBotSettings`; show the returned `message` (success or error) inline. Use the project's existing Tailwind classes (copy the input/button styling from `bot-controls.tsx`).

- [ ] **Step 7: Write the page.** Create `app/dashboard/bot/settings/page.tsx` — an async server component: build `createAdminClient()`, read the `bot_setting` row (`.from("bot_setting").select("*").eq("id",1).maybeSingle()`), map it to `BotSettingsInput` (derive the pace choice from min/max), render `<AppHeader/>`, a heading "Réglages du bot", `<SettingsForm initial={...} />`, and a line "Dernière modif: {updated_by} · {updated_at}". No auth gate (tailnet-gated; login is removed in Task 6 — until then the existing proxy still allows it for an authenticated dev).

- [ ] **Step 8: Add the nav link.** In `app/dashboard/bot/page.tsx`, add a `<Link href="/dashboard/bot/settings">Réglages →</Link>` near the footer controls, matching the existing card/link style.

- [ ] **Step 9: Gate.** `pnpm exec tsc --noEmit` → 0; `pnpm lint` → 0 errors; `pnpm test` → green; `pnpm build` → exit 0 with `/dashboard/bot/settings` in the route list.

- [ ] **Step 10: Commit.**
```bash
git add lib/auth/current-editor.ts app/dashboard/bot/settings tests/unit/bot-settings-action.test.ts app/dashboard/bot/page.tsx
git commit -m "$(cat <<'EOF'
feat(config): add bot settings page, form, and save action

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
EOF
)"
```

---

## Task 5: Localhost bind + Tailscale serve runbook

**Files:**
- Modify: `ecosystem.config.cjs`
- Create: `docs/setup-tailscale-serve.md`

**Interfaces:** Consumes none. Produces the access posture (operator runs the tailscale commands).

- [ ] **Step 1: Bind the app to localhost.** In `ecosystem.config.cjs`, change the `pacman` app's `args` from `"start"` to `"start -- -H 127.0.0.1"` (so `next start -H 127.0.0.1 -p 3005`; verify the `-p 3005` comes from the existing `start` script — `package.json` `start` is `next start -H 0.0.0.0 -p 3005`, so ALSO update the `start` script to `next start -H 127.0.0.1 -p 3005` and keep ecosystem `args: "start"`). Pick ONE place to set the host; do not set it in two conflicting spots. Recommended: change `package.json` `"start"` to `"next start -H 127.0.0.1 -p 3005"`.

- [ ] **Step 2: Write the runbook.** Create `docs/setup-tailscale-serve.md` documenting, for the operator, exactly:
  - Turn Funnel OFF: `tailscale funnel --https=443 off` (and `:8443`, `:10000` if listed by `tailscale serve status`).
  - Turn serve ON (tailnet-only): `tailscale serve --bg --https=443 127.0.0.1:3005`.
  - Rebuild + restart: `pnpm build && pm2 restart pacman`.
  - Verify: from a second tailnet device, `https://hino1-thinkcentre-m93p.tail0e1ea8.ts.net` loads; from a non-tailnet network it is unreachable; `curl http://100.107.207.88:3005` (tailnet IP, direct) now refuses (localhost bind).
  - A loud note: re-enabling Funnel or reverting the bind to `0.0.0.0` exposes the app with NO login — do not.

- [ ] **Step 3: Verify config parses.** `node -e "require('./ecosystem.config.cjs')"` (no throw); `grep -n '127.0.0.1' package.json ecosystem.config.cjs`.

- [ ] **Step 4: Commit.**
```bash
git add ecosystem.config.cjs package.json docs/setup-tailscale-serve.md
git commit -m "$(cat <<'EOF'
feat(config): bind app to localhost + tailscale serve runbook

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
EOF
)"
```

---

## Task 6: Remove the magic-link login (tailnet is the gate)

**Files:**
- Delete: `app/login/`, `app/dashboard/users/`, `lib/auth/actions.ts`, `lib/auth/whitelist.ts`, `lib/auth/require-user.ts`
- Modify: `proxy.ts`, `lib/supabase/middleware.ts`, `app/dashboard/bot/page.tsx`, `app/dashboard/bot/actions.ts`, `app/dashboard/bot/screenshot/route.ts`, `app/dashboard/page.tsx`, `app/page.tsx`

**Interfaces:** Consumes `currentEditor()` (Task 4). Produces an app with no application-layer auth (tailnet-gated).

- [ ] **Step 1: Replace the auth gate in the bot routes.** `grep -rn "requireAllowedUser" app lib`. In each caller (`app/dashboard/bot/page.tsx`, `app/dashboard/bot/actions.ts`, `app/dashboard/bot/screenshot/route.ts`): remove the `requireAllowedUser()` call/import. For the page, drop the auth/redirect entirely. For the actions and the screenshot route, drop the auth gate (tailnet is the gate); keep the screenshot route's path-traversal guard intact.

- [ ] **Step 2: Simplify proxy + middleware.** Replace `proxy.ts` body so it no longer enforces a session — simplest: delete `proxy.ts` entirely (Next runs without it). If kept, make `proxy` a pass-through returning `NextResponse.next()`. Remove `lib/supabase/middleware.ts` if `updateSession` is now unused (`grep -rn updateSession app lib`).

- [ ] **Step 3: Simplify the dashboard shell + home.** `app/dashboard/page.tsx`: remove the auth/redirect and the Users nav card; keep the Bot card + add nothing else. `app/page.tsx`: it currently redirects auth→/dashboard else→/login; change it to always `redirect("/dashboard")` (login is gone).

- [ ] **Step 4: Delete the auth surface.**
```bash
git rm -r app/login app/dashboard/users lib/auth/actions.ts lib/auth/whitelist.ts lib/auth/require-user.ts
```
Then `grep -rn "@/lib/auth/actions\|@/lib/auth/whitelist\|@/lib/auth/require-user\|/login\|app_user" app lib` and remove every remaining reference (e.g. `isEmailAllowed`, the login link). Keep `lib/auth/current-editor.ts` and `lib/graph/mail.ts` (still used).

- [ ] **Step 5: Green gate.** `rm -rf .next && pnpm typecheck && pnpm lint && pnpm test && pnpm build` — all exit 0; the build route list shows `/dashboard`, `/dashboard/bot`, `/dashboard/bot/settings`, `/dashboard/bot/screenshot`, and NO `/login` or `/dashboard/users`.

- [ ] **Step 6: Commit.**
```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(config): remove magic-link login (tailnet is the gate)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LDqfDquH9NyZcVNFjfpc1Y
EOF
)"
```

---

## Final verification

- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all green.
- `bot_setting` editable end to end: edit on `/dashboard/bot/settings` → row updates → next cycle reads new values (verify by reading `getBotConfig` against the live row).
- Operator runbook (`docs/setup-tailscale-serve.md`) executed: Funnel off, serve on, app reachable only on the tailnet, login gone.
