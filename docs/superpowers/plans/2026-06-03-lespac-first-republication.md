# LesPAC-First Republication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the primary Pacman workflow around SERTI inventory, active LesPAC listings, and assisted Facebook Marketplace republication.

**Architecture:** Add a focused LesPAC publication-state layer fed by the existing LesPAC API. Internal inventory becomes a LesPAC-first workboard with three sections, while public catalogue queries use confirmed active LesPAC links instead of `listing.is_published`. Facebook Marketplace drafts are generated from LesPAC publication data plus SERTI identity and remain human-published.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase Postgres/RLS, SERTI DB2 via `node-jt400`, LesPAC REST API, Vitest, Playwright for UI verification.

---

## Scope Check

This is one integrated MVP because each part depends on the same publication-state model:

- LesPAC API sync creates snapshots.
- Matching links snapshots to SERTI units.
- Internal UI and public catalogue both read those links.
- Facebook drafts use the linked LesPAC snapshot.

Do not bring back Sandhills, Google, Meta Ads, or bulk multi-channel publishing in this plan.

## File Structure

- `supabase/migrations/20260603120000_lespac_publication_state.sql`
  - Dedicated table for LesPAC snapshots and confirmed unit links.
- `lib/supabase/types.ts`
  - Temporary hand update for the new table until generated types are refreshed.
- `lib/lespac/publication-state.ts`
  - Pure normalization, matching, grouping, and public eligibility helpers.
- `lib/lespac/publication-sync.ts`
  - LesPAC API sync and Supabase upsert orchestration.
- `lib/lespac/publication-queries.ts`
  - Query helpers for workboard, public catalogue, and draft generation.
- `app/inventaire/lespac-actions.ts`
  - Authenticated server actions: manual sync, confirm link, ignore link, record Marketplace URL.
- `app/inventaire/page.tsx`
  - New LesPAC-first inventory page.
- `app/inventaire/lespac-workboard.tsx`
  - Client component for the three-section workboard.
- `app/inventaire/complet/page.tsx`
  - Keeps the old full inventory table reachable as a secondary tool.
- `lib/listings/public.ts`
  - Public catalogue and detail now read confirmed active LesPAC listings.
- `lib/facebook-marketplace/draft.ts`
  - Draft generation prefers linked LesPAC data.
- `app/api/assisted-draft/[platform]/[unit]/route.ts`
  - Continues to serve script drafts, now based on LesPAC for Facebook.
- `scripts/facebook-marketplace-draft.mjs`
  - Keep final-publish guard; adjust text/output only if draft fields change.
- `tests/unit/lespac-publication-state.test.ts`
  - Pure helper coverage.
- `tests/unit/lespac-publication-sync.test.ts`
  - Sync payload and upsert coverage via mocks.
- `tests/unit/public-listings-lespac.test.ts`
  - Public catalogue filtering and cost stripping.
- `tests/unit/facebook-marketplace-draft.test.ts`
  - Update existing tests for LesPAC-first draft behavior.

## Task 1: Database State Layer

**Files:**
- Create: `supabase/migrations/20260603120000_lespac_publication_state.sql`
- Modify: `lib/supabase/types.ts`

- [ ] **Step 1: Add the migration**

Create `supabase/migrations/20260603120000_lespac_publication_state.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.lespac_listing_state (
  listing_id bigint PRIMARY KEY,
  vendor_id text,
  unit text,
  link_status text NOT NULL DEFAULT 'needs_review',
  match_score int NOT NULL DEFAULT 0,
  match_reasons text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL,
  title text NOT NULL DEFAULT '',
  price_cad int,
  description text NOT NULL DEFAULT '',
  listing_url text,
  category text,
  year int,
  state text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  image_urls text[] NOT NULL DEFAULT ARRAY[]::text[],
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmed_by uuid,
  confirmed_at timestamptz,
  ignored_at timestamptz,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lespac_listing_state_link_status_valid
    CHECK (link_status IN ('confirmed','needs_review','ignored')),
  CONSTRAINT lespac_listing_state_match_score_valid
    CHECK (match_score >= 0)
);

CREATE INDEX IF NOT EXISTS lespac_listing_state_unit_idx
  ON public.lespac_listing_state(unit);

CREATE INDEX IF NOT EXISTS lespac_listing_state_status_link_idx
  ON public.lespac_listing_state(status, link_status);

CREATE INDEX IF NOT EXISTS lespac_listing_state_last_synced_idx
  ON public.lespac_listing_state(last_synced_at DESC);

DROP TRIGGER IF EXISTS lespac_listing_state_touch ON public.lespac_listing_state;
CREATE TRIGGER lespac_listing_state_touch
  BEFORE UPDATE ON public.lespac_listing_state
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.lespac_listing_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lespac_listing_state_auth_all ON public.lespac_listing_state;
CREATE POLICY lespac_listing_state_auth_all ON public.lespac_listing_state
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS lespac_listing_state_service_all ON public.lespac_listing_state;
CREATE POLICY lespac_listing_state_service_all ON public.lespac_listing_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Update local Supabase types**

Add a `lespac_listing_state` entry under `Database["public"]["Tables"]` in `lib/supabase/types.ts` with this shape:

```ts
lespac_listing_state: {
  Row: {
    listing_id: number;
    vendor_id: string | null;
    unit: string | null;
    link_status: "confirmed" | "needs_review" | "ignored";
    match_score: number;
    match_reasons: string[];
    status: string;
    title: string;
    price_cad: number | null;
    description: string;
    listing_url: string | null;
    category: string | null;
    year: number | null;
    state: string | null;
    attributes: Json;
    image_urls: string[];
    raw: Json;
    confirmed_by: string | null;
    confirmed_at: string | null;
    ignored_at: string | null;
    last_synced_at: string;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    listing_id: number;
    vendor_id?: string | null;
    unit?: string | null;
    link_status?: "confirmed" | "needs_review" | "ignored";
    match_score?: number;
    match_reasons?: string[];
    status: string;
    title?: string;
    price_cad?: number | null;
    description?: string;
    listing_url?: string | null;
    category?: string | null;
    year?: number | null;
    state?: string | null;
    attributes?: Json;
    image_urls?: string[];
    raw?: Json;
    confirmed_by?: string | null;
    confirmed_at?: string | null;
    ignored_at?: string | null;
    last_synced_at?: string;
    created_at?: string;
    updated_at?: string;
  };
  Update: {
    listing_id?: number;
    vendor_id?: string | null;
    unit?: string | null;
    link_status?: "confirmed" | "needs_review" | "ignored";
    match_score?: number;
    match_reasons?: string[];
    status?: string;
    title?: string;
    price_cad?: number | null;
    description?: string;
    listing_url?: string | null;
    category?: string | null;
    year?: number | null;
    state?: string | null;
    attributes?: Json;
    image_urls?: string[];
    raw?: Json;
    confirmed_by?: string | null;
    confirmed_at?: string | null;
    ignored_at?: string | null;
    last_synced_at?: string;
    created_at?: string;
    updated_at?: string;
  };
  Relationships: [];
};
```

- [ ] **Step 3: Verify types compile**

Run: `pnpm typecheck`

Expected: typecheck may still fail because of unrelated existing worktree changes, but it must not report errors for `lespac_listing_state`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260603120000_lespac_publication_state.sql lib/supabase/types.ts
git commit -m "feat: add lespac publication state"
```

## Task 2: Pure LesPAC Publication Helpers

**Files:**
- Create: `lib/lespac/publication-state.ts`
- Create: `tests/unit/lespac-publication-state.test.ts`
- Reuse: `lib/lespac/types.ts`

- [ ] **Step 1: Write helper tests**

Create `tests/unit/lespac-publication-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  classifyLespacLink,
  groupLespacWorkboard,
  normalizeLespacSnapshot,
  rankLespacUnitMatches,
} from "@/lib/lespac/publication-state";
import type { LespacListing } from "@/lib/lespac/types";

const listing = (overrides: Partial<LespacListing> = {}): LespacListing => ({
  listingId: 123,
  vendorId: "",
  category: "Véhicules - Camions",
  title: "2020 Hino 195",
  description: "Annonce LesPAC",
  price: 69000,
  postalCode: "G7H 5A8",
  contact: {
    type: "STANDARD",
    emailAddress: "service@camion-hino.ca",
    firstName: "Service",
    lastName: "Ventes",
  },
  status: "ONLINE",
  state: "USED",
  year: 2020,
  listingURL: "https://www.lespac.com/123",
  imageURLs: ["https://img.test/1.jpg", "https://img.test/2.jpg"],
  attributes: {
    Marque: "Hino",
    "Modèle": "195",
    "Kilométrage": "117000",
  },
  ...overrides,
});

const candidates = [
  { unit: "H195", make: "HINO", model: "195", year: 2020, km: 117500, status: "available" as const, price_cad: 70000 },
  { unit: "F0063U", make: "FORD", model: "TRANSIT T-", year: 2020, km: 10, status: "available" as const, price_cad: 16847 },
];

describe("normalizeLespacSnapshot", () => {
  it("extracts public listing fields without inventing missing values", () => {
    expect(normalizeLespacSnapshot(listing())).toMatchObject({
      listing_id: 123,
      vendor_id: null,
      status: "ONLINE",
      title: "2020 Hino 195",
      price_cad: 69000,
      description: "Annonce LesPAC",
      image_urls: ["https://img.test/1.jpg", "https://img.test/2.jpg"],
    });
  });
});

describe("rankLespacUnitMatches", () => {
  it("ranks compatible SERTI units by make model year mileage and price", () => {
    const matches = rankLespacUnitMatches(listing(), candidates);
    expect(matches[0]).toMatchObject({
      unit: "H195",
      score: expect.any(Number),
      reasons: expect.arrayContaining(["marque", "modèle", "année", "km ±10%", "prix ±10%"]),
    });
    expect(matches[0].score).toBeGreaterThan(matches[1]?.score ?? 0);
  });
});

describe("classifyLespacLink", () => {
  it("confirms vendorId unit matches", () => {
    expect(classifyLespacLink(listing({ vendorId: "F0063U" }), candidates, null)).toMatchObject({
      unit: "F0063U",
      link_status: "confirmed",
      match_reasons: ["vendorId"],
    });
  });

  it("keeps probable matches in review", () => {
    expect(classifyLespacLink(listing(), candidates, null)).toMatchObject({
      unit: "H195",
      link_status: "needs_review",
    });
  });

  it("honors previous confirmed links", () => {
    expect(classifyLespacLink(listing(), candidates, "H195")).toMatchObject({
      unit: "H195",
      link_status: "confirmed",
      match_reasons: ["lien confirmé"],
    });
  });
});

describe("groupLespacWorkboard", () => {
  it("separates confirmed, review, and missing LesPAC work", () => {
    const groups = groupLespacWorkboard({
      rows: [
        { listing_id: 1, unit: "H195", link_status: "confirmed", status: "ONLINE" },
        { listing_id: 2, unit: "F0063U", link_status: "needs_review", status: "ONLINE" },
      ],
      inventory: candidates,
    });

    expect(groups.onLespac.map((r) => r.listing_id)).toEqual([1]);
    expect(groups.needsReview.map((r) => r.listing_id)).toEqual([2]);
    expect(groups.publishFirst.map((r) => r.unit)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm test tests/unit/lespac-publication-state.test.ts`

Expected: FAIL because `lib/lespac/publication-state.ts` does not exist.

- [ ] **Step 3: Implement pure helpers**

Create `lib/lespac/publication-state.ts` with exports used by the tests:

```ts
import type { LespacListing } from "@/lib/lespac/types";

export interface SertiMatchCandidate {
  unit: string;
  make: string;
  model: string;
  year: number;
  km: number;
  status: "available" | "quoted" | "sold";
  price_cad?: number;
}

export interface LespacSnapshotInput {
  listing_id: number;
  vendor_id: string | null;
  unit: string | null;
  link_status: "confirmed" | "needs_review" | "ignored";
  match_score: number;
  match_reasons: string[];
  status: string;
}

export interface MatchResult {
  unit: string | null;
  link_status: "confirmed" | "needs_review";
  match_score: number;
  match_reasons: string[];
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function norm(value: string | null | undefined): string {
  return clean(value).toLowerCase().replace(/[\s\-_.]+/g, "");
}

function intAttr(detail: LespacListing, key: string): number {
  const raw = detail.attributes?.[key] ?? "";
  return Number.parseInt(raw.replace(/[^\d]/g, ""), 10) || 0;
}

export function normalizeLespacSnapshot(detail: LespacListing) {
  if (detail.listingId == null) throw new Error("LesPAC listingId missing");
  return {
    listing_id: detail.listingId,
    vendor_id: clean(detail.vendorId) || null,
    status: detail.status,
    title: clean(detail.title),
    price_cad: Number(detail.price ?? 0) > 0 ? Number(detail.price) : null,
    description: clean(detail.description),
    listing_url: clean(detail.listingURL) || `https://www.lespac.com/${detail.listingId}`,
    category: clean(detail.category) || null,
    year: detail.year ?? null,
    state: detail.state ?? null,
    attributes: detail.attributes ?? {},
    image_urls: detail.imageURLs ?? [],
    raw: detail,
    last_synced_at: new Date().toISOString(),
  };
}

export function rankLespacUnitMatches(
  detail: LespacListing,
  candidates: SertiMatchCandidate[],
) {
  const make = norm(detail.attributes?.Marque);
  const model = norm(detail.attributes?.["Modèle"]);
  const year = detail.year ?? 0;
  const km = intAttr(detail, "Kilométrage");
  const price = Number(detail.price ?? 0) || 0;

  return candidates
    .map((candidate) => {
      let score = 0;
      const reasons: string[] = [];
      if (make && norm(candidate.make) === make) {
        score += 50;
        reasons.push("marque");
      }
      if (model && norm(candidate.model) === model) {
        score += 30;
        reasons.push("modèle");
      }
      if (year > 0 && candidate.year === year) {
        score += 15;
        reasons.push("année");
      }
      if (km > 0 && candidate.km > 0) {
        const delta = Math.abs(candidate.km - km) / Math.max(candidate.km, km);
        if (delta <= 0.1) {
          score += 10;
          reasons.push("km ±10%");
        } else if (delta <= 0.25) {
          score += 5;
          reasons.push("km ±25%");
        }
      }
      if (price > 0 && candidate.price_cad && candidate.price_cad > 0) {
        const delta = Math.abs(candidate.price_cad - price) / Math.max(candidate.price_cad, price);
        if (delta <= 0.1) {
          score += 8;
          reasons.push("prix ±10%");
        } else if (delta <= 0.25) {
          score += 4;
          reasons.push("prix ±25%");
        }
      }
      return { unit: candidate.unit, score, reasons };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function classifyLespacLink(
  detail: LespacListing,
  candidates: SertiMatchCandidate[],
  confirmedUnit: string | null,
): MatchResult {
  if (confirmedUnit) {
    return {
      unit: confirmedUnit,
      link_status: "confirmed",
      match_score: 999,
      match_reasons: ["lien confirmé"],
    };
  }

  const vendorId = clean(detail.vendorId);
  if (vendorId && candidates.some((candidate) => candidate.unit === vendorId)) {
    return {
      unit: vendorId,
      link_status: "confirmed",
      match_score: 998,
      match_reasons: ["vendorId"],
    };
  }

  const [best] = rankLespacUnitMatches(detail, candidates);
  return {
    unit: best?.unit ?? null,
    link_status: "needs_review",
    match_score: best?.score ?? 0,
    match_reasons: best?.reasons ?? [],
  };
}

export function groupLespacWorkboard({
  rows,
  inventory,
}: {
  rows: LespacSnapshotInput[];
  inventory: SertiMatchCandidate[];
}) {
  const activeRows = rows.filter((row) => row.status === "ONLINE" && row.link_status !== "ignored");
  const onLespac = activeRows.filter((row) => row.link_status === "confirmed" && row.unit);
  const needsReview = activeRows.filter((row) => row.link_status === "needs_review");
  const confirmedUnits = new Set(onLespac.map((row) => row.unit).filter(Boolean));
  const publishFirst = inventory.filter(
    (vehicle) => vehicle.status === "available" && !confirmedUnits.has(vehicle.unit),
  );
  return { onLespac, needsReview, publishFirst };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test tests/unit/lespac-publication-state.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/lespac/publication-state.ts tests/unit/lespac-publication-state.test.ts
git commit -m "feat: add lespac publication matching helpers"
```

## Task 3: LesPAC Sync Service

**Files:**
- Create: `lib/lespac/publication-sync.ts`
- Create: `tests/unit/lespac-publication-sync.test.ts`
- Create: `app/inventaire/lespac-actions.ts`

- [ ] **Step 1: Write sync tests**

Create `tests/unit/lespac-publication-sync.test.ts` covering a pure function `buildLespacStateRows(details, candidates, confirmedLinks)`:

```ts
import { describe, expect, it } from "vitest";
import { buildLespacStateRows } from "@/lib/lespac/publication-sync";
import type { LespacListing } from "@/lib/lespac/types";

const detail = (id: number, vendorId = ""): LespacListing => ({
  listingId: id,
  vendorId,
  category: "Véhicules - Camions",
  title: "2020 Hino 195",
  price: 69000,
  description: "Texte LesPAC",
  postalCode: "G7H 5A8",
  contact: { type: "STANDARD", emailAddress: "x@y.test", firstName: "A", lastName: "B" },
  status: "ONLINE",
  state: "USED",
  year: 2020,
  imageURLs: ["https://img.test/1.jpg"],
  attributes: { Marque: "Hino", "Modèle": "195", "Kilométrage": "117000" },
});

describe("buildLespacStateRows", () => {
  it("preserves confirmed links and normalizes detail snapshots", () => {
    const rows = buildLespacStateRows({
      details: [detail(10)],
      candidates: [{ unit: "H195", make: "HINO", model: "195", year: 2020, km: 117000, status: "available", price_cad: 69000 }],
      confirmedLinks: new Map([["10", "H195"]]),
    });

    expect(rows[0]).toMatchObject({
      listing_id: 10,
      unit: "H195",
      link_status: "confirmed",
      status: "ONLINE",
      title: "2020 Hino 195",
      price_cad: 69000,
    });
  });

  it("confirms vendorId matches automatically", () => {
    const rows = buildLespacStateRows({
      details: [detail(11, "F0063U")],
      candidates: [{ unit: "F0063U", make: "FORD", model: "TRANSIT T-", year: 2020, km: 10, status: "available", price_cad: 16847 }],
      confirmedLinks: new Map(),
    });

    expect(rows[0]).toMatchObject({
      unit: "F0063U",
      link_status: "confirmed",
      match_reasons: ["vendorId"],
    });
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm test tests/unit/lespac-publication-sync.test.ts`

Expected: FAIL because `publication-sync.ts` does not exist.

- [ ] **Step 3: Implement sync service**

Create `lib/lespac/publication-sync.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { getByListingId, listAll } from "@/lib/lespac/client";
import type { LespacListing } from "@/lib/lespac/types";
import {
  classifyLespacLink,
  normalizeLespacSnapshot,
  type SertiMatchCandidate,
} from "@/lib/lespac/publication-state";
import { listInventoryVehicles } from "@/lib/serti/wgi";
import type { Database } from "@/lib/supabase/types";

type Client = SupabaseClient<Database>;

export function buildLespacStateRows({
  details,
  candidates,
  confirmedLinks,
}: {
  details: LespacListing[];
  candidates: SertiMatchCandidate[];
  confirmedLinks: Map<string, string>;
}) {
  return details
    .filter((detail): detail is LespacListing & { listingId: number } => detail.listingId != null)
    .map((detail) => {
      const listingId = String(detail.listingId);
      const link = classifyLespacLink(detail, candidates, confirmedLinks.get(listingId) ?? null);
      return {
        ...normalizeLespacSnapshot(detail),
        unit: link.unit,
        link_status: link.link_status,
        match_score: link.match_score,
        match_reasons: link.match_reasons,
      };
    });
}

export async function syncLespacPublicationState(supabase: Client) {
  const [summaries, vehicles, existingRes] = await Promise.all([
    listAll(),
    listInventoryVehicles(),
    supabase
      .from("lespac_listing_state")
      .select("listing_id, unit, link_status")
      .eq("link_status", "confirmed"),
  ]);
  if (existingRes.error) throw new Error(`lespac existing links: ${existingRes.error.message}`);

  const details = (
    await Promise.all(summaries.map((summary) => getByListingId(summary.listingId).catch(() => null)))
  ).filter((detail): detail is LespacListing => Boolean(detail?.listingId));

  const confirmedLinks = new Map<string, string>();
  for (const row of existingRes.data ?? []) {
    if (row.unit) confirmedLinks.set(String(row.listing_id), row.unit);
  }

  const candidates = vehicles.map((vehicle) => ({
    unit: vehicle.unit,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    km: vehicle.km,
    status: vehicle.status,
    price_cad: 0,
  }));
  const rows = buildLespacStateRows({ details, candidates, confirmedLinks });

  if (rows.length > 0) {
    const { error } = await supabase.from("lespac_listing_state").upsert(rows, {
      onConflict: "listing_id",
    });
    if (error) throw new Error(`lespac upsert: ${error.message}`);
  }

  return {
    synced: rows.length,
    online: rows.filter((row) => row.status === "ONLINE").length,
    confirmed: rows.filter((row) => row.link_status === "confirmed").length,
    needs_review: rows.filter((row) => row.link_status === "needs_review").length,
  };
}
```

- [ ] **Step 4: Add authenticated server actions**

Create `app/inventaire/lespac-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { syncLespacPublicationState } from "@/lib/lespac/publication-sync";

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Non authentifié");
  return { supabase, userId: data.user.id };
}

export async function syncLespacNow() {
  const { supabase } = await requireUser();
  const result = await syncLespacPublicationState(supabase);
  revalidatePath("/inventaire");
  revalidatePath("/");
  return result;
}

export async function confirmLespacUnitLink(listingId: number, unit: string) {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase
    .from("lespac_listing_state")
    .update({
      unit,
      link_status: "confirmed",
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
      ignored_at: null,
    })
    .eq("listing_id", listingId);
  if (error) throw new Error(`Confirmer LesPAC: ${error.message}`);
  revalidatePath("/inventaire");
  revalidatePath("/");
}

export async function ignoreLespacListing(listingId: number) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("lespac_listing_state")
    .update({
      link_status: "ignored",
      ignored_at: new Date().toISOString(),
    })
    .eq("listing_id", listingId);
  if (error) throw new Error(`Ignorer LesPAC: ${error.message}`);
  revalidatePath("/inventaire");
}

export async function recordMarketplaceUrl(unit: string, url: string) {
  const { supabase } = await requireUser();
  const cleanUrl = url.trim();
  if (!/^https:\/\/(www\.)?facebook\.com\//i.test(cleanUrl)) {
    throw new Error("Lien Facebook invalide");
  }
  const { error } = await supabase.from("listing_channel_state").upsert(
    {
      unit,
      channel: "fb_marketplace",
      last_status: "published_manual",
      external_url: cleanUrl,
      last_synced_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: "unit,channel" },
  );
  if (error) throw new Error(`Lien Marketplace: ${error.message}`);
  revalidatePath("/inventaire");
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm test tests/unit/lespac-publication-sync.test.ts tests/unit/lespac-publication-state.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/lespac/publication-sync.ts app/inventaire/lespac-actions.ts tests/unit/lespac-publication-sync.test.ts
git commit -m "feat: sync lespac publication state"
```

## Task 4: Workboard Query Model

**Files:**
- Create: `lib/lespac/publication-queries.ts`
- Test: extend `tests/unit/lespac-publication-state.test.ts`

- [ ] **Step 1: Add grouping test for missing SERTI units**

Append this test to `tests/unit/lespac-publication-state.test.ts`:

```ts
it("puts available SERTI units without confirmed ONLINE LesPAC into publishFirst", () => {
  const groups = groupLespacWorkboard({
    rows: [{ listing_id: 1, unit: "H195", link_status: "confirmed", status: "ONLINE" }],
    inventory: [
      { unit: "H195", make: "HINO", model: "195", year: 2020, km: 1000, status: "available" },
      { unit: "F0063U", make: "FORD", model: "TRANSIT", year: 2020, km: 10, status: "available" },
    ],
  });

  expect(groups.publishFirst.map((row) => row.unit)).toEqual(["F0063U"]);
});
```

- [ ] **Step 2: Run helper tests**

Run: `pnpm test tests/unit/lespac-publication-state.test.ts`

Expected: PASS after Task 2 implementation already supports this.

- [ ] **Step 3: Implement query helpers**

Create `lib/lespac/publication-queries.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listInventoryVehicles, getVehicleByUnit } from "@/lib/serti/wgi";
import type { Database } from "@/lib/supabase/types";
import { groupLespacWorkboard } from "@/lib/lespac/publication-state";

export type LespacStateRow = Database["public"]["Tables"]["lespac_listing_state"]["Row"];

export interface LespacWorkboardContext {
  onLespac: LespacStateRow[];
  needsReview: LespacStateRow[];
  publishFirst: Awaited<ReturnType<typeof listInventoryVehicles>>;
  inventory: Awaited<ReturnType<typeof listInventoryVehicles>>;
}

export async function fetchLespacWorkboard(): Promise<LespacWorkboardContext> {
  const supabase = await createClient();
  const [rowsRes, inventory] = await Promise.all([
    supabase
      .from("lespac_listing_state")
      .select("*")
      .order("last_synced_at", { ascending: false }),
    listInventoryVehicles(),
  ]);
  if (rowsRes.error) throw new Error(`lespac state: ${rowsRes.error.message}`);
  return {
    ...groupLespacWorkboard({ rows: rowsRes.data ?? [], inventory }),
    inventory,
  };
}

export async function fetchActiveLespacPublicRows() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("lespac_listing_state")
    .select("*")
    .eq("status", "ONLINE")
    .eq("link_status", "confirmed")
    .not("unit", "is", null);
  if (error) throw new Error(`active LesPAC public rows: ${error.message}`);
  return data ?? [];
}

export async function fetchConfirmedLespacByUnit(unit: string) {
  const supabase = createAdminClient();
  const [vehicle, rowRes] = await Promise.all([
    getVehicleByUnit(unit),
    supabase
      .from("lespac_listing_state")
      .select("*")
      .eq("unit", unit)
      .eq("status", "ONLINE")
      .eq("link_status", "confirmed")
      .maybeSingle(),
  ]);
  if (rowRes.error) throw new Error(`LesPAC ${unit}: ${rowRes.error.message}`);
  if (!vehicle || !vehicle.available || !rowRes.data) return null;
  return { vehicle, lespac: rowRes.data };
}
```

- [ ] **Step 4: Typecheck targeted files**

Run: `pnpm typecheck`

Expected: no errors from `lib/lespac/publication-queries.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/lespac/publication-queries.ts tests/unit/lespac-publication-state.test.ts
git commit -m "feat: add lespac workboard queries"
```

## Task 5: LesPAC-First Internal Interface

**Files:**
- Modify: `app/inventaire/page.tsx`
- Create: `app/inventaire/lespac-workboard.tsx`
- Create: `app/inventaire/complet/page.tsx`
- Reuse: `app/inventaire/inventaire-table.tsx`

- [ ] **Step 1: Preserve full inventory as secondary page**

Create `app/inventaire/complet/page.tsx` by moving the current behavior of `app/inventaire/page.tsx` into this file. Keep the existing `searchParams` handling, `fetchInventory()`, `fetchInventoryAlerts()`, `AppHeader`, and `InventaireTable` calls unchanged except the title should be `"Inventaire complet"` and the back link should point to `/inventaire`.

The copied page must still:

- await `searchParams` because this is Next.js 16
- call `fetchInventory()` and `fetchInventoryAlerts()`
- pass `initialAttention` into `InventaireTable`
- keep `/inventaire?attention=photos` behavior working on `/inventaire/complet?attention=photos`

- [ ] **Step 2: Replace `/inventaire` with LesPAC-first page**

Modify `app/inventaire/page.tsx`:

```tsx
import Link from "next/link";
import AppHeader from "@/app/app-header";
import { fetchLespacWorkboard } from "@/lib/lespac/publication-queries";
import LespacWorkboard from "./lespac-workboard";

export const dynamic = "force-dynamic";

export default async function InventairePage() {
  const ctx = await fetchLespacWorkboard();

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader
        title="Inventaire LesPAC"
        right={
          <>
            <span className="text-xs text-white/70">
              {ctx.onLespac.length} sur LesPAC
            </span>
            <Link href="/dashboard" className="text-xs text-white/70 hover:text-white">
              Tableau de bord
            </Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-xs text-white/70 hover:text-white">
                Déconnexion
              </button>
            </form>
          </>
        }
      />
      <LespacWorkboard ctx={ctx} />
    </main>
  );
}
```

- [ ] **Step 3: Create the workboard component**

Create `app/inventaire/lespac-workboard.tsx` as a client component. Required UI behavior:

- Top action bar: `Synchroniser LesPAC`, `Inventaire complet`, `Catalogue public`.
- Summary metrics: `Sur LesPAC`, `À vérifier`, `À publier sur LesPAC`.
- Section 1 first: confirmed online LesPAC listings with primary image, unit, title, price, CTA `Préparer Marketplace`.
- Section 2: review rows with select for unit and buttons `Confirmer` and `Ignorer`.
- Section 3: available SERTI units without LesPAC link with CTA `Ouvrir LesPAC`.

Use these design constraints:

- No nested cards.
- Cards only for repeated vehicle/listing rows, 8px radius or less.
- Dense, work-focused layout.
- Buttons must have stable min height and no text overflow on mobile.
- Use restrained neutral background, white list rows, blue primary CTA, amber review state, green confirmed state.

Use this component structure so the interface remains dense and predictable:

```tsx
"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { LespacWorkboardContext } from "@/lib/lespac/publication-queries";
import {
  confirmLespacUnitLink,
  ignoreLespacListing,
  recordMarketplaceUrl,
  syncLespacNow,
} from "./lespac-actions";

const money = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

export default function LespacWorkboard({ ctx }: { ctx: LespacWorkboardContext }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const candidates = useMemo(
    () => ctx.inventory.filter((vehicle) => vehicle.status === "available"),
    [ctx.inventory],
  );

  function sync() {
    setMessage(null);
    startTransition(async () => {
      const result = await syncLespacNow();
      setMessage(
        `LesPAC synchronisé: ${result.online} en ligne, ${result.confirmed} confirmée(s), ${result.needs_review} à vérifier.`,
      );
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2 border bg-white p-3">
        <button
          type="button"
          disabled={pending}
          onClick={sync}
          className="inline-flex min-h-11 items-center justify-center rounded border border-blue-700 bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {pending ? "Synchronisation..." : "Synchroniser LesPAC"}
        </button>
        <Link className="inline-flex min-h-11 items-center rounded border px-3 py-2 text-sm" href="/inventaire/complet">
          Inventaire complet
        </Link>
        <Link className="inline-flex min-h-11 items-center rounded border px-3 py-2 text-sm" href="/" target="_blank">
          Catalogue public
        </Link>
      </div>

      {message && <p className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">{message}</p>}

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Sur LesPAC" value={ctx.onLespac.length} tone="good" />
        <Metric label="À vérifier" value={ctx.needsReview.length} tone="warn" />
        <Metric label="À publier sur LesPAC" value={ctx.publishFirst.length} />
      </section>

      <section className="space-y-3">
        <SectionTitle title="Déjà sur LesPAC" count={ctx.onLespac.length} />
        {ctx.onLespac.map((row) => (
          <LespacRow key={row.listing_id} row={row} />
        ))}
      </section>

      <section className="space-y-3">
        <SectionTitle title="À vérifier" count={ctx.needsReview.length} />
        {ctx.needsReview.map((row) => (
          <ReviewRow key={row.listing_id} row={row} candidates={candidates} />
        ))}
      </section>

      <section className="space-y-3">
        <SectionTitle title="À publier sur LesPAC" count={ctx.publishFirst.length} />
        {ctx.publishFirst.map((vehicle) => (
          <PublishFirstRow key={vehicle.unit} vehicle={vehicle} />
        ))}
      </section>
    </div>
  );
}
```

Implement `Metric`, `SectionTitle`, `LespacRow`, `ReviewRow`, and `PublishFirstRow` in the same file. Keep each row as a single top-level `article` with `grid gap-3 rounded border bg-white p-4`.

- [ ] **Step 4: Implement workboard actions**

In `lespac-workboard.tsx`, import:

```ts
import {
  confirmLespacUnitLink,
  ignoreLespacListing,
  recordMarketplaceUrl,
  syncLespacNow,
} from "./lespac-actions";
```

Use `useTransition()` around action calls. Show one inline status message above the sections, not modal alerts.

- [ ] **Step 5: Manual visual check**

Run: `pnpm dev`

Open:

- `http://127.0.0.1:3005/inventaire`
- `http://127.0.0.1:3005/inventaire/complet`

Expected:

- `/inventaire` is immediately understandable as a three-section LesPAC workboard.
- `/inventaire/complet` still shows the old full inventory.
- Mobile width does not overlap buttons, titles, photos, or controls.

- [ ] **Step 6: Commit**

```bash
git add app/inventaire/page.tsx app/inventaire/lespac-workboard.tsx app/inventaire/complet/page.tsx
git commit -m "ui: make inventory lespac first"
```

## Task 6: Public Catalogue Uses LesPAC Publication State

**Files:**
- Modify: `lib/listings/public.ts`
- Create: `tests/unit/public-listings-lespac.test.ts`

- [ ] **Step 1: Write public mapping tests**

Create `tests/unit/public-listings-lespac.test.ts` with pure helper expectations. If helpers do not exist yet, add them in Step 3:

```ts
import { describe, expect, it } from "vitest";
import { mapLespacPublicListing, mapLespacPublicDetail } from "@/lib/listings/public";

const vehicle = {
  unit: "H195",
  vin: "VIN",
  make: "Hino",
  model: "195",
  year: 2020,
  km: 117000,
  color: "Blanc",
  category: "CAMION USAGE",
  status: "available",
  status_raw: "A",
  available: true,
  avail_raw: "1",
  avail_comment: "",
  date_added: null,
  cost: 123456,
};

const lespac = {
  listing_id: 10,
  unit: "H195",
  link_status: "confirmed",
  status: "ONLINE",
  title: "Hino 195 2020",
  price_cad: 69000,
  description: "Description LesPAC",
  image_urls: ["https://img.test/1.jpg", "https://img.test/2.jpg"],
  listing_url: "https://www.lespac.com/10",
};

describe("LesPAC public mapping", () => {
  it("uses LesPAC price description and photos without cost", () => {
    const row = mapLespacPublicListing(vehicle, lespac);

    expect(row).toMatchObject({
      unit: "H195",
      price_cad: 69000,
      description_fr: "Description LesPAC",
      hero_url: "https://img.test/1.jpg",
      photo_count: 2,
    });
    expect(JSON.stringify(row)).not.toContain("123456");
    expect("cost" in row).toBe(false);
  });

  it("maps detail photos from LesPAC URLs", () => {
    const detail = mapLespacPublicDetail(vehicle, lespac);
    expect(detail.photos).toEqual([
      { url_medium: "https://img.test/1.jpg", url_thumb: "https://img.test/1.jpg", url_original: "https://img.test/1.jpg", is_hero: true },
      { url_medium: "https://img.test/2.jpg", url_thumb: "https://img.test/2.jpg", url_original: "https://img.test/2.jpg", is_hero: false },
    ]);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm test tests/unit/public-listings-lespac.test.ts`

Expected: FAIL because mapping helpers are not exported.

- [ ] **Step 3: Update public listing module**

In `lib/listings/public.ts`:

- Export `stripCost` or keep it internal and use it from new mapping helpers.
- Add `mapLespacPublicListing(vehicle, lespac)`.
- Add `mapLespacPublicDetail(vehicle, lespac)`.
- Change `fetchPublicListings()` to read `fetchActiveLespacPublicRows()`, join to `listInventoryVehicles()`, and map only vehicles still `available`.
- Change `fetchPublicListingByUnit()` to use `fetchConfirmedLespacByUnit(unit)`.

The returned public objects must keep the existing `PublicListing` and `PublicListingDetail` shape so `CatalogViews` and `/vehicule/[unit]` continue working.

- [ ] **Step 4: Run public tests**

Run:

```bash
pnpm test tests/unit/public-listings-lespac.test.ts
pnpm test tests/unit/listings-display.test.ts
```

Expected: PASS.

- [ ] **Step 5: Manually inspect public catalogue**

Run: `pnpm dev`

Open: `http://127.0.0.1:3005/`

Expected:

- Public catalogue shows only confirmed active LesPAC units.
- Price and text match LesPAC, not the old Supabase `listing` row.
- No admin cost appears in rendered text or page source.

- [ ] **Step 6: Commit**

```bash
git add lib/listings/public.ts tests/unit/public-listings-lespac.test.ts
git commit -m "feat: drive public catalogue from lespac"
```

## Task 7: Facebook Marketplace Drafts From LesPAC

**Files:**
- Modify: `lib/facebook-marketplace/draft.ts`
- Modify: `tests/unit/facebook-marketplace-draft.test.ts`
- Verify: `app/api/assisted-draft/[platform]/[unit]/route.ts`
- Verify: `scripts/facebook-marketplace-draft.mjs`

- [ ] **Step 1: Update draft tests**

In `tests/unit/facebook-marketplace-draft.test.ts`, add a test for a new pure helper `buildMarketplaceDraftFromLespac({ vehicle, lespac })`:

```ts
it("builds Facebook draft from linked LesPAC data first", async () => {
  const draft = await buildMarketplaceDraftFromLespac({
    vehicle: detail(),
    lespac: {
      listing_id: 10,
      unit: "F0063U",
      link_status: "confirmed",
      status: "ONLINE",
      title: "Titre LesPAC vendeur",
      price_cad: 31995,
      description: "Description LesPAC vendeur",
      image_urls: ["https://img.test/a.jpg"],
      listing_url: "https://www.lespac.com/10",
    },
  });

  expect(draft).toMatchObject({
    platform: "facebook_marketplace",
    title: "Titre LesPAC vendeur",
    price_cad: 31995,
    description: expect.stringContaining("Description LesPAC vendeur"),
  });
  expect(draft.photos[0]).toMatchObject({ url: "https://img.test/a.jpg" });
  expect(JSON.stringify(draft)).not.toContain("cost");
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm test tests/unit/facebook-marketplace-draft.test.ts`

Expected: FAIL because `buildMarketplaceDraftFromLespac` is not exported.

- [ ] **Step 3: Implement LesPAC-first draft helper**

In `lib/facebook-marketplace/draft.ts`:

- Export `buildMarketplaceDraftFromLespac({ vehicle, lespac, platform = "facebook_marketplace" })`.
- Keep the existing `buildMarketplaceDraft(detail, platform)` for fallback compatibility.
- Update `fetchMarketplaceDraft(unit, platform)` so it first calls `fetchConfirmedLespacByUnit(unit)` and returns a LesPAC-first draft when available; otherwise return the old fallback draft.

Draft rules:

- `title`: LesPAC title.
- `price_cad`: LesPAC price, or `0` if null.
- `description`: LesPAC description plus dealer contact and public catalogue URL.
- `photos`: LesPAC `image_urls`, capped at 10.
- warnings include `"Annonce LesPAC non confirmée."` only in fallback path, not for confirmed LesPAC rows.

- [ ] **Step 4: Run draft tests**

Run: `pnpm test tests/unit/facebook-marketplace-draft.test.ts`

Expected: PASS.

- [ ] **Step 5: Verify script still fetches draft**

Start dev server if needed, then run:

```bash
pnpm marketplace:draft F0063U --download-only
```

Expected:

- Creates or updates `output/assisted-drafts/facebook-marketplace/F0063U/`.
- `description.txt` uses LesPAC text when F0063U has a confirmed active LesPAC link.
- Script does not click Publish.

- [ ] **Step 6: Commit**

```bash
git add lib/facebook-marketplace/draft.ts tests/unit/facebook-marketplace-draft.test.ts
git commit -m "feat: build marketplace drafts from lespac"
```

## Task 8: Navigation And Copy Polish

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `docs/facebook-marketplace-assisted.md`
- Modify: `README.md`

- [ ] **Step 1: Update dashboard primary links**

In `app/dashboard/page.tsx`:

- Make `/inventaire` card copy say: `Voir ce qui est sur LesPAC, rattacher les annonces et préparer Marketplace.`
- Move Meta/Sandhills tools under advanced only.
- Keep public catalogue link.
- Remove wording that implies Pacman is the primary multi-platform publication console.

- [ ] **Step 2: Update assisted docs**

In `docs/facebook-marketplace-assisted.md`, add a top section:

```md
## Nouveau flux

1. Le vendeur publie d'abord sur LesPAC.
2. Pacman synchronise LesPAC par API.
3. Pacman rattache l'annonce LesPAC à l'unité SERTI.
4. Pacman prépare Facebook Marketplace à partir de l'annonce LesPAC.
5. Le vendeur vérifie et publie manuellement.
```

- [ ] **Step 3: Update README product summary**

In `README.md`, change the public/internal description to say:

- SERTI is inventory source.
- LesPAC active confirmed listings control public catalogue visibility.
- Facebook Marketplace is assisted, not fully automated.

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/page.tsx docs/facebook-marketplace-assisted.md README.md
git commit -m "docs: describe lespac first workflow"
```

## Task 9: UI Quality Gate

**Files:**
- Inspect: `app/inventaire/lespac-workboard.tsx`
- Inspect: `app/globals.css`
- Optional screenshots: `output/ui-checks/`

- [ ] **Step 1: Run dev server**

Run: `pnpm dev`

Expected: Next.js starts on `http://localhost:3005`.

- [ ] **Step 2: Capture desktop and mobile screenshots**

Use Playwright against:

- `http://127.0.0.1:3005/inventaire`
- `http://127.0.0.1:3005/`

Viewport checks:

- Desktop: `1440x1000`
- Mobile: `390x844`

Expected:

- LesPAC workboard has the three sections visible and understandable.
- Important CTAs are visible without horizontal scrolling.
- Text does not overlap controls.
- Repeated rows have consistent photo aspect ratio and row height.
- The design is restrained and operational, not a marketing hero page.
- No UI cards are nested inside other cards.

- [ ] **Step 3: Fix visual issues**

If screenshots show crowding, fix with:

- grid columns using `lg:grid-cols-[...]`
- `min-w-0` on text containers
- `truncate` only for secondary metadata, not critical titles
- `break-words` for URLs
- stable button classes: `inline-flex min-h-11 items-center justify-center rounded border px-3 py-2 text-sm font-medium`

- [ ] **Step 4: Run full verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Expected: PASS, except unrelated pre-existing failures must be documented with exact error names and files.

- [ ] **Step 5: Final commit**

```bash
git add app/inventaire/lespac-workboard.tsx app/globals.css
git commit -m "ui: polish lespac workboard"
```

If screenshots are intentionally kept, add them in a separate commit:

```bash
git add output/ui-checks
git commit -m "test: add lespac workboard screenshots"
```

## Final Acceptance

- LesPAC API sync returns current `ONLINE` listings and stores snapshots.
- Confirmed LesPAC links determine public catalogue visibility.
- `/inventaire` is a polished LesPAC-first workboard.
- `/inventaire/complet` preserves the old complete inventory view.
- Public pages never expose SERTI cost.
- Facebook Marketplace drafts use LesPAC price, text, and photos.
- Facebook automation stops before final publication.
- Meta business/Ads and other feed destinations are no longer the primary workflow.
