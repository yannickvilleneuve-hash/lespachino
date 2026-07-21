# Inventaire public sur le site web — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher l'inventaire LesPAC sur camion-hino.ca, servi par un snapshot Supabase en lecture seule, sans toucher aux feeds que Meta consomme.

**Architecture:** Un worker pm2 dédié appelle `fetchCatalog()` aux 15 min et écrase un snapshot Supabase (`catalog_vehicle`, `catalog_photo`, `catalog_sync`), en refusant d'écrire un lot vide. L'index `/vehicule` et la fiche `/vehicule/[id]` lisent ce snapshot; `serveFeed()` garde son fetch LesPAC live et reste littéralement inchangé. Le site est embarqué dans WordPress par iframe auto-redimensionnée.

**Tech Stack:** Next.js 16.2.4 (Turbopack, App Router), React 19.2.5, Supabase (`@supabase/supabase-js`), vitest, pm2, Tailwind (classes utilitaires inline).

Spec: `docs/superpowers/specs/2026-07-21-inventaire-site-web-design.md`

## Global Constraints

- **LesPAC est la source de vérité.** Aucune écriture vers LesPAC, aucune édition de véhicule côté pacman. La synchro écrase, point.
- **Ne jamais modifier `lib/feeds/serve.ts`, `lib/feeds/eligibility.ts`, `lib/feeds/meta-vehicle-csv.ts`, `lib/feeds/meta-vehicle.ts`, `lib/feeds/google-vla.ts`, ni les routes sous `app/feeds/`.** La campagne Meta « Camions Hino — Catalogue Saguenay » diffuse depuis `/feeds/meta.csv`. Un feed vide a déjà gelé le catalogue Meta le 2026-07-15.
- **Un lot vide ou une erreur LesPAC n'écrase jamais le snapshot.** C'est la règle de sécurité centrale du worker.
- Next.js 16: `params` est un `Promise`, toujours `await`. `cookies()` idem.
- Le service_role (`createAdminClient()`) est SERVER-ONLY — jamais importé depuis un Client Component.
- Français pour tout texte visible par un visiteur. Anglais pour les commentaires de code, comme le reste du repo.
- Rouge Hino = `#ed1c24`, fond `#0e0e0f`, police Oswald — repris de `app/vehicule/[id]/page.tsx`.
- `pnpm lint` et `pnpm typecheck` verts avant chaque commit.

---

### Task 1: Schéma du snapshot

**Files:**
- Create: `supabase/migrations/20260721120000_catalog_snapshot.sql`
- Modify: `lib/supabase/types.ts` (régénéré, ne pas éditer à la main)

**Interfaces:**
- Consumes: rien.
- Produces: tables `public.catalog_vehicle`, `public.catalog_photo`, `public.catalog_sync`; types `Database["public"]["Tables"]["catalog_vehicle"]` etc.

- [ ] **Step 1: Écrire la migration**

`supabase/migrations/20260721120000_catalog_snapshot.sql`:

```sql
-- Snapshot en lecture seule du catalogue LesPAC.
-- LesPAC reste la source de vérité: la synchro écrase, personne n'édite ici.

CREATE TABLE IF NOT EXISTS public.catalog_vehicle (
  id            text PRIMARY KEY,              -- listingId LesPAC
  payload       jsonb NOT NULL,                -- CatalogVehicle normalisé
  status        text NOT NULL DEFAULT 'online',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  sold_at       timestamptz,
  CONSTRAINT catalog_vehicle_status_valid CHECK (status IN ('online', 'sold'))
);

CREATE INDEX IF NOT EXISTS catalog_vehicle_status_idx
  ON public.catalog_vehicle (status);

CREATE TABLE IF NOT EXISTS public.catalog_photo (
  vehicle_id   text NOT NULL REFERENCES public.catalog_vehicle(id) ON DELETE CASCADE,
  position     int NOT NULL,
  source_url   text NOT NULL,                  -- CDN LesPAC, tel qu'émis dans les feeds
  storage_path text,                           -- miroir bucket vehicle-photos, null si pas encore copié
  PRIMARY KEY (vehicle_id, position)
);

-- Singleton: porte la fraîcheur de la dernière synchro.
CREATE TABLE IF NOT EXISTS public.catalog_sync (
  id     int PRIMARY KEY DEFAULT 1,
  ran_at timestamptz NOT NULL DEFAULT now(),
  ok     boolean NOT NULL DEFAULT false,
  count  int NOT NULL DEFAULT 0,
  error  text,
  CONSTRAINT catalog_sync_singleton CHECK (id = 1)
);

INSERT INTO public.catalog_sync (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.catalog_vehicle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_photo   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_sync    ENABLE ROW LEVEL SECURITY;

-- Même posture que listing/vehicle_photo: authenticated full access, anon rien.
-- Les pages publiques passent par createAdminClient() (service_role, bypass RLS).
DROP POLICY IF EXISTS catalog_vehicle_auth_all ON public.catalog_vehicle;
CREATE POLICY catalog_vehicle_auth_all ON public.catalog_vehicle
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS catalog_photo_auth_all ON public.catalog_photo;
CREATE POLICY catalog_photo_auth_all ON public.catalog_photo
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS catalog_sync_auth_all ON public.catalog_sync;
CREATE POLICY catalog_sync_auth_all ON public.catalog_sync
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Appliquer la migration**

Utiliser le MCP Supabase `apply_migration` avec le nom `catalog_snapshot` et le contenu du fichier ci-haut.

Vérifier ensuite avec le MCP `execute_sql`:

```sql
SELECT id, ok, count FROM public.catalog_sync;
```

Attendu: 1 ligne, `id=1`, `ok=false`, `count=0`.

- [ ] **Step 3: Régénérer les types**

Utiliser le MCP Supabase `generate_typescript_types` et écrire le résultat dans `lib/supabase/types.ts`.

- [ ] **Step 4: Vérifier que les types compilent**

Run: `pnpm typecheck`
Expected: aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260721120000_catalog_snapshot.sql lib/supabase/types.ts
git commit -m "feat(catalog): snapshot tables for the public inventory"
```

---

### Task 2: Règle de visibilité du site

**Files:**
- Create: `lib/catalog/visibility.ts`
- Test: `tests/unit/catalog-visibility.test.ts`

**Interfaces:**
- Consumes: `CatalogVehicle` de `lib/catalog/types.ts`.
- Produces: `siteVisible(v: CatalogVehicle): boolean`.

Distincte de `selectEligible()` volontairement: les plateformes rejettent un véhicule sans prix, notre site l'affiche.

- [ ] **Step 1: Écrire les tests qui échouent**

`tests/unit/catalog-visibility.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { siteVisible } from "@/lib/catalog/visibility";
import type { CatalogVehicle } from "@/lib/catalog/types";

function vehicle(over: Partial<CatalogVehicle> = {}): CatalogVehicle {
  return {
    id: "223612404",
    title: "Isuzu NRR 2022 avec Fourgon de 20 pieds",
    description: "Bon état",
    priceCad: 39733,
    year: 2022,
    make: "Isuzu",
    model: "NRR",
    km: 249000,
    isNew: false,
    isVehicle: true,
    bodyStyle: "TRUCK",
    exteriorColor: "Blanc",
    transmission: "AUTOMATIC",
    fuelType: "GASOLINE",
    photoUrls: ["https://cdn.lespac.com/a.jpg"],
    ...over,
  };
}

describe("siteVisible", () => {
  it("shows a truck with no price — 'prix à discuter' is still for sale", () => {
    expect(siteVisible(vehicle({ priceCad: null }))).toBe(true);
  });

  it("hides a listing with no photo — an empty card sells nothing", () => {
    expect(siteVisible(vehicle({ photoUrls: [] }))).toBe(false);
  });

  it("hides non-vehicles (bare cargo boxes, trailers)", () => {
    expect(siteVisible(vehicle({ isVehicle: false }))).toBe(false);
  });

  it("shows a complete listing", () => {
    expect(siteVisible(vehicle())).toBe(true);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm vitest run tests/unit/catalog-visibility.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/catalog/visibility"`.

- [ ] **Step 3: Implémenter**

`lib/catalog/visibility.ts`:

```ts
import type { CatalogVehicle } from "@/lib/catalog/types";

/**
 * What earns a spot on our own website.
 *
 * Deliberately looser than `selectEligible()` in lib/feeds/eligibility.ts: Meta
 * and Google reject an item with no price, so the feeds drop it. We do not —
 * "prix à discuter" is a real truck a buyer can call about, and hiding it loses
 * a sale to satisfy a rule that is not ours.
 *
 * A photo is the one hard requirement: a card with no image sells nothing.
 */
export function siteVisible(v: CatalogVehicle): boolean {
  return v.isVehicle && v.photoUrls.length > 0;
}
```

- [ ] **Step 4: Lancer le test**

Run: `pnpm vitest run tests/unit/catalog-visibility.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/catalog/visibility.ts tests/unit/catalog-visibility.test.ts
git commit -m "feat(catalog): site visibility rule, looser than feed eligibility"
```

---

### Task 3: Écriture du snapshot

**Files:**
- Create: `lib/catalog/snapshot.ts`
- Test: `tests/unit/catalog-snapshot.test.ts`

**Interfaces:**
- Consumes: `fetchCatalog()` de `lib/catalog/fetch.ts`, `CatalogVehicle`.
- Produces:
  - `interface SyncResult { ok: boolean; written: number; sold: number; error: string | null }`
  - `runCatalogSync(supabase: SupabaseLike, fetchAll?: () => Promise<CatalogVehicle[]>): Promise<SyncResult>`

Le miroir des photos n'est PAS dans cette tâche (Task 4) — `runCatalogSync` écrit `catalog_photo` avec `storage_path = null`.

- [ ] **Step 1: Écrire les tests qui échouent**

`tests/unit/catalog-snapshot.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runCatalogSync } from "@/lib/catalog/snapshot";
import type { CatalogVehicle } from "@/lib/catalog/types";

type Row = Record<string, unknown>;

function vehicle(over: Partial<CatalogVehicle> = {}): CatalogVehicle {
  return {
    id: "1",
    title: "Isuzu NRR 2022",
    description: "Bon état",
    priceCad: 39733,
    year: 2022,
    make: "Isuzu",
    model: "NRR",
    km: 249000,
    isNew: false,
    isVehicle: true,
    bodyStyle: "TRUCK",
    exteriorColor: "Blanc",
    transmission: "AUTOMATIC",
    fuelType: "GASOLINE",
    photoUrls: ["https://cdn.lespac.com/a.jpg"],
    ...over,
  };
}

interface Capture {
  known: Row[]; // rows already in catalog_vehicle
  vehicleUpserts: Row[];
  photoUpserts: Row[];
  soldUpdates: Array<{ patch: Row; notIn: string[] }>;
  syncUpserts: Row[];
  photoDeletes: string[];
}

function emptyCapture(known: Row[] = []): Capture {
  return {
    known,
    vehicleUpserts: [],
    photoUpserts: [],
    soldUpdates: [],
    syncUpserts: [],
    photoDeletes: [],
  };
}

function makeSupabase(c: Capture) {
  return {
    from(table: string) {
      return {
        select(_cols: string) {
          return Promise.resolve({ data: c.known, error: null });
        },
        upsert(payload: Row | Row[]) {
          const rows = Array.isArray(payload) ? payload : [payload];
          if (table === "catalog_vehicle") c.vehicleUpserts.push(...rows);
          if (table === "catalog_photo") c.photoUpserts.push(...rows);
          if (table === "catalog_sync") c.syncUpserts.push(...rows);
          return Promise.resolve({ data: null, error: null });
        },
        update(patch: Row) {
          return {
            eq(_col: string, _val: unknown) {
              return {
                not(_c: string, _op: string, list: string) {
                  c.soldUpdates.push({
                    patch,
                    notIn: list.replace(/^\(|\)$/g, "").split(",").filter(Boolean),
                  });
                  return Promise.resolve({ data: null, error: null });
                },
              };
            },
          };
        },
        delete() {
          return {
            eq(_col: string, val: string) {
              c.photoDeletes.push(val);
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  } as unknown as Parameters<typeof runCatalogSync>[0];
}

describe("runCatalogSync", () => {
  it("writes the fetched vehicles and their photos", async () => {
    const c = emptyCapture();
    const result = await runCatalogSync(makeSupabase(c), async () => [
      vehicle({ id: "1", photoUrls: ["https://cdn.lespac.com/a.jpg", "https://cdn.lespac.com/b.jpg"] }),
    ]);

    expect(result.ok).toBe(true);
    expect(result.written).toBe(1);
    expect(c.vehicleUpserts).toHaveLength(1);
    expect(c.vehicleUpserts[0].id).toBe("1");
    expect(c.vehicleUpserts[0].status).toBe("online");
    expect(c.photoUpserts).toHaveLength(2);
    expect(c.photoUpserts[0]).toMatchObject({
      vehicle_id: "1",
      position: 0,
      source_url: "https://cdn.lespac.com/a.jpg",
    });
  });

  it("REFUSES to write an empty lot — a LesPAC hiccup must not wipe the site", async () => {
    const c = emptyCapture([{ id: "1", status: "online" }]);
    const result = await runCatalogSync(makeSupabase(c), async () => []);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/vide/i);
    expect(c.vehicleUpserts).toHaveLength(0);
    expect(c.soldUpdates).toHaveLength(0);
    expect(c.syncUpserts[0]).toMatchObject({ ok: false });
  });

  it("REFUSES to write when the fetch throws", async () => {
    const c = emptyCapture([{ id: "1", status: "online" }]);
    const result = await runCatalogSync(makeSupabase(c), async () => {
      throw new Error("Lespac GET /listings → 401: token expired");
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/401/);
    expect(c.vehicleUpserts).toHaveLength(0);
    expect(c.soldUpdates).toHaveLength(0);
  });

  it("marks vehicles absent from the fetch as sold", async () => {
    const c = emptyCapture([
      { id: "1", status: "online" },
      { id: "2", status: "online" },
    ]);
    const result = await runCatalogSync(makeSupabase(c), async () => [vehicle({ id: "1" })]);

    expect(result.sold).toBe(1);
    expect(c.soldUpdates).toHaveLength(1);
    expect(c.soldUpdates[0].patch).toMatchObject({ status: "sold" });
    expect(c.soldUpdates[0].notIn).toEqual(["1"]);
  });

  it("brings a re-listed vehicle back online and clears sold_at", async () => {
    const c = emptyCapture([{ id: "1", status: "sold" }]);
    await runCatalogSync(makeSupabase(c), async () => [vehicle({ id: "1" })]);

    expect(c.vehicleUpserts[0]).toMatchObject({ id: "1", status: "online", sold_at: null });
  });

  it("replaces the photo rows of a vehicle rather than accumulating them", async () => {
    const c = emptyCapture([{ id: "1", status: "online" }]);
    await runCatalogSync(makeSupabase(c), async () => [vehicle({ id: "1" })]);

    expect(c.photoDeletes).toContain("1");
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm vitest run tests/unit/catalog-snapshot.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/catalog/snapshot"`.

- [ ] **Step 3: Implémenter**

`lib/catalog/snapshot.ts`:

```ts
import { fetchCatalog } from "@/lib/catalog/fetch";
import type { CatalogVehicle } from "@/lib/catalog/types";
import type { createAdminClient } from "@/lib/supabase/admin";

type SupabaseLike = ReturnType<typeof createAdminClient>;

export interface SyncResult {
  ok: boolean;
  written: number;
  sold: number;
  error: string | null;
}

/**
 * Refresh the read-only snapshot of the LesPAC catalog.
 *
 * The whole point of this function is the guard: an empty lot is NEVER written.
 * `fetchCatalog()` returns [] both when the dealer really has no trucks and when
 * the LesPAC token expired — and the second case is far more likely. Wiping the
 * snapshot on that would take the public site down and, once the feeds read from
 * here, would hand Meta an empty file. An empty meta.csv already froze the Meta
 * catalog once, on 2026-07-15. So: no lot, no write, previous snapshot survives.
 *
 * `fetchAll` is injectable for tests only; production always uses fetchCatalog.
 */
export async function runCatalogSync(
  supabase: SupabaseLike,
  fetchAll: () => Promise<CatalogVehicle[]> = fetchCatalog,
): Promise<SyncResult> {
  let fresh: CatalogVehicle[];
  try {
    fresh = await fetchAll();
  } catch (err) {
    return fail(supabase, err instanceof Error ? err.message : String(err));
  }

  if (fresh.length === 0) {
    return fail(supabase, "LesPAC a retourné un lot vide — snapshot conservé");
  }

  const now = new Date().toISOString();

  for (const v of fresh) {
    await supabase.from("catalog_vehicle").upsert({
      id: v.id,
      payload: v as unknown as Record<string, unknown>,
      status: "online",
      last_seen_at: now,
      sold_at: null,
    });

    // Replace, don't accumulate: a seller who reorders or removes photos must
    // not leave orphan rows behind that would resurface on the card.
    await supabase.from("catalog_photo").delete().eq("vehicle_id", v.id);
    if (v.photoUrls.length > 0) {
      await supabase.from("catalog_photo").upsert(
        v.photoUrls.map((url, position) => ({
          vehicle_id: v.id,
          position,
          source_url: url,
          storage_path: null,
        })),
      );
    }
  }

  // Anything the fetch did not return is gone from LesPAC: sold, or deactivated
  // and about to be re-posted under a new listingId. Indistinguishable from here.
  const knownIds = fresh.map((v) => v.id);
  const { data: rows } = await supabase.from("catalog_vehicle").select("id, status");
  const soldCount = (rows ?? []).filter(
    (r) => r.status === "online" && !knownIds.includes(r.id),
  ).length;

  if (soldCount > 0) {
    await supabase
      .from("catalog_vehicle")
      .update({ status: "sold", sold_at: now })
      .eq("status", "online")
      .not("id", "in", `(${knownIds.join(",")})`);
  }

  await supabase
    .from("catalog_sync")
    .upsert({ id: 1, ran_at: now, ok: true, count: fresh.length, error: null });

  return { ok: true, written: fresh.length, sold: soldCount, error: null };
}

async function fail(supabase: SupabaseLike, error: string): Promise<SyncResult> {
  await supabase.from("catalog_sync").upsert({
    id: 1,
    ran_at: new Date().toISOString(),
    ok: false,
    count: 0,
    error: error.slice(0, 500),
  });
  return { ok: false, written: 0, sold: 0, error };
}
```

- [ ] **Step 4: Lancer le test**

Run: `pnpm vitest run tests/unit/catalog-snapshot.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add lib/catalog/snapshot.ts tests/unit/catalog-snapshot.test.ts
git commit -m "feat(catalog): snapshot writer that refuses to write an empty lot"
```

---

### Task 4: Miroir des photos

**Files:**
- Create: `lib/catalog/photos.ts`
- Modify: `lib/catalog/snapshot.ts` (appel du miroir après l'écriture des lignes)
- Test: `tests/unit/catalog-photos.test.ts`

**Interfaces:**
- Consumes: le bucket `vehicle-photos` (public depuis la migration `20260422160000_bucket_vehicle_photos_public.sql`).
- Produces:
  - `mirrorPhoto(supabase, vehicleId: string, position: number, sourceUrl: string): Promise<string | null>` — retourne le `storage_path`, ou `null` si le téléchargement échoue.
  - `publicPhotoUrl(storagePath: string): string`

- [ ] **Step 1: Écrire les tests qui échouent**

`tests/unit/catalog-photos.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mirrorPhoto, publicPhotoUrl } from "@/lib/catalog/photos";

interface Capture {
  uploads: Array<{ path: string; contentType: string | undefined }>;
}

function makeSupabase(c: Capture) {
  return {
    storage: {
      from(_bucket: string) {
        return {
          upload(path: string, _body: ArrayBuffer, opts?: { contentType?: string }) {
            c.uploads.push({ path, contentType: opts?.contentType });
            return Promise.resolve({ data: { path }, error: null });
          },
        };
      },
    },
  } as unknown as Parameters<typeof mirrorPhoto>[0];
}

describe("publicPhotoUrl", () => {
  it("builds the public storage URL from the bucket path", () => {
    expect(publicPhotoUrl("catalog/1/0.jpg")).toBe(
      "https://proj.supabase.co/storage/v1/object/public/vehicle-photos/catalog/1/0.jpg",
    );
  });
});

describe("mirrorPhoto", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({ "content-type": "image/jpeg" }),
        arrayBuffer: async () => new ArrayBuffer(8),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads under catalog/<id>/<position>.<ext> and returns the path", async () => {
    const c: Capture = { uploads: [] };
    const path = await mirrorPhoto(makeSupabase(c), "223612404", 0, "https://cdn.lespac.com/a.jpg");

    expect(path).toBe("catalog/223612404/0.jpg");
    expect(c.uploads[0]).toMatchObject({
      path: "catalog/223612404/0.jpg",
      contentType: "image/jpeg",
    });
  });

  it("returns null when the source photo cannot be downloaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
    const c: Capture = { uploads: [] };
    const path = await mirrorPhoto(makeSupabase(c), "1", 0, "https://cdn.lespac.com/gone.jpg");

    expect(path).toBeNull();
    expect(c.uploads).toHaveLength(0);
  });
});
```

Le test de `publicPhotoUrl` exige `NEXT_PUBLIC_SUPABASE_URL=https://proj.supabase.co` dans l'environnement de test. Ajouter en tête du fichier, avant les imports:

```ts
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm vitest run tests/unit/catalog-photos.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/catalog/photos"`.

- [ ] **Step 3: Implémenter**

`lib/catalog/photos.ts`:

```ts
import type { createAdminClient } from "@/lib/supabase/admin";

type SupabaseLike = ReturnType<typeof createAdminClient>;

const BUCKET = "vehicle-photos";

/**
 * Public URL of a mirrored photo. The bucket is public since migration
 * 20260422160000, so no signed URL is needed.
 */
export function publicPhotoUrl(storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

function extensionFor(contentType: string, sourceUrl: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  const guess = sourceUrl.split("?")[0].split(".").pop();
  return guess && guess.length <= 4 ? guess : "jpg";
}

/**
 * Copy one LesPAC CDN photo into our own bucket.
 *
 * Hotlinking the CDN works until the ad is deactivated, at which point every
 * image on our site 404s at once. Mirroring also lets next/image optimize them.
 *
 * A failure here is not fatal: the caller keeps `source_url`, so the card still
 * renders from the CDN. Returning null rather than throwing is the point.
 */
export async function mirrorPhoto(
  supabase: SupabaseLike,
  vehicleId: string,
  position: number,
  sourceUrl: string,
): Promise<string | null> {
  let body: ArrayBuffer;
  let contentType: string;
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) return null;
    contentType = res.headers.get("content-type") ?? "image/jpeg";
    body = await res.arrayBuffer();
  } catch {
    return null;
  }

  const path = `catalog/${vehicleId}/${position}.${extensionFor(contentType, sourceUrl)}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType, upsert: true });

  return error ? null : path;
}
```

- [ ] **Step 4: Lancer le test**

Run: `pnpm vitest run tests/unit/catalog-photos.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Brancher le miroir dans le writer**

Dans `lib/catalog/snapshot.ts`, ajouter l'import:

```ts
import { mirrorPhoto } from "@/lib/catalog/photos";
```

puis remplacer le bloc d'upsert des photos par:

```ts
    if (v.photoUrls.length > 0) {
      const rows = [];
      for (const [position, url] of v.photoUrls.entries()) {
        rows.push({
          vehicle_id: v.id,
          position,
          source_url: url,
          storage_path: await mirrorPhoto(supabase, v.id, position, url),
        });
      }
      await supabase.from("catalog_photo").upsert(rows);
    }
```

- [ ] **Step 6: Vérifier que les tests du writer passent toujours**

Run: `pnpm vitest run tests/unit/catalog-snapshot.test.ts tests/unit/catalog-photos.test.ts`
Expected: PASS. Le faux client de `catalog-snapshot.test.ts` n'expose pas `storage`, donc `mirrorPhoto` doit y échouer proprement et retourner `null`.

Si un test échoue avec `Cannot read properties of undefined (reading 'from')`, ajouter au faux client de `tests/unit/catalog-snapshot.test.ts`:

```ts
    storage: {
      from() {
        return { upload: () => Promise.resolve({ data: null, error: { message: "no storage in test" } }) };
      },
    },
```

et stubber `fetch` en tête du `describe`:

```ts
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
  });
  afterEach(() => vi.unstubAllGlobals());
```

en important `vi, beforeEach, afterEach` depuis vitest.

- [ ] **Step 7: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: aucune erreur.

- [ ] **Step 8: Commit**

```bash
git add lib/catalog/photos.ts lib/catalog/snapshot.ts tests/unit/catalog-photos.test.ts tests/unit/catalog-snapshot.test.ts
git commit -m "feat(catalog): mirror LesPAC photos into our own bucket"
```

---

### Task 5: Lecture du snapshot

**Files:**
- Create: `lib/catalog/read.ts`
- Test: `tests/unit/catalog-read.test.ts`

**Interfaces:**
- Consumes: `siteVisible()` (Task 2), `publicPhotoUrl()` (Task 4).
- Produces:
  - `interface SnapshotPhoto { position: number; sourceUrl: string; storagePath: string | null }`
  - `interface SnapshotVehicle { vehicle: CatalogVehicle; status: "online" | "sold"; photos: SnapshotPhoto[] }`
  - `listOnlineVehicles(): Promise<SnapshotVehicle[]>` — déjà filtrée par `siteVisible`, triée par année décroissante.
  - `getSnapshotVehicle(id: string): Promise<SnapshotVehicle | null>`
  - `photoSrc(p: SnapshotPhoto): string` — le miroir si présent, sinon le CDN LesPAC.

- [ ] **Step 1: Écrire les tests qui échouent**

`tests/unit/catalog-read.test.ts`:

```ts
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";

import { describe, it, expect } from "vitest";
import { photoSrc, sortByYearDesc, toSnapshotVehicle } from "@/lib/catalog/read";
import type { CatalogVehicle } from "@/lib/catalog/types";

function vehicle(over: Partial<CatalogVehicle> = {}): CatalogVehicle {
  return {
    id: "1",
    title: "Isuzu NRR 2022",
    description: "",
    priceCad: 39733,
    year: 2022,
    make: "Isuzu",
    model: "NRR",
    km: 249000,
    isNew: false,
    isVehicle: true,
    bodyStyle: "TRUCK",
    exteriorColor: null,
    transmission: null,
    fuelType: null,
    photoUrls: ["https://cdn.lespac.com/a.jpg"],
    ...over,
  };
}

describe("photoSrc", () => {
  it("prefers our mirrored copy", () => {
    expect(
      photoSrc({ position: 0, sourceUrl: "https://cdn.lespac.com/a.jpg", storagePath: "catalog/1/0.jpg" }),
    ).toBe("https://proj.supabase.co/storage/v1/object/public/vehicle-photos/catalog/1/0.jpg");
  });

  it("falls back to the LesPAC CDN when the mirror failed", () => {
    expect(
      photoSrc({ position: 0, sourceUrl: "https://cdn.lespac.com/a.jpg", storagePath: null }),
    ).toBe("https://cdn.lespac.com/a.jpg");
  });
});

describe("sortByYearDesc", () => {
  it("puts the newest trucks first", () => {
    const rows = [
      { vehicle: vehicle({ id: "a", year: 2018 }), status: "online" as const, photos: [] },
      { vehicle: vehicle({ id: "b", year: 2024 }), status: "online" as const, photos: [] },
      { vehicle: vehicle({ id: "c", year: null }), status: "online" as const, photos: [] },
    ];
    expect(sortByYearDesc(rows).map((r) => r.vehicle.id)).toEqual(["b", "a", "c"]);
  });
});

describe("toSnapshotVehicle", () => {
  it("rebuilds the vehicle and its ordered photos from DB rows", () => {
    const row = {
      id: "1",
      payload: vehicle(),
      status: "online",
      photos: [
        { position: 1, source_url: "https://cdn.lespac.com/b.jpg", storage_path: null },
        { position: 0, source_url: "https://cdn.lespac.com/a.jpg", storage_path: "catalog/1/0.jpg" },
      ],
    };
    const snap = toSnapshotVehicle(row);

    expect(snap.status).toBe("online");
    expect(snap.vehicle.make).toBe("Isuzu");
    expect(snap.photos.map((p) => p.position)).toEqual([0, 1]);
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `pnpm vitest run tests/unit/catalog-read.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/catalog/read"`.

- [ ] **Step 3: Implémenter**

`lib/catalog/read.ts`:

```ts
import { createAdminClient } from "@/lib/supabase/admin";
import { publicPhotoUrl } from "@/lib/catalog/photos";
import { siteVisible } from "@/lib/catalog/visibility";
import type { CatalogVehicle } from "@/lib/catalog/types";

export interface SnapshotPhoto {
  position: number;
  sourceUrl: string;
  storagePath: string | null;
}

export interface SnapshotVehicle {
  vehicle: CatalogVehicle;
  status: "online" | "sold";
  photos: SnapshotPhoto[];
}

interface PhotoRow {
  position: number;
  source_url: string;
  storage_path: string | null;
}

interface VehicleRow {
  id: string;
  payload: unknown;
  status: string;
  photos: PhotoRow[] | null;
}

/** Our mirrored copy when we have one, the LesPAC CDN when the mirror failed. */
export function photoSrc(p: SnapshotPhoto): string {
  return p.storagePath ? publicPhotoUrl(p.storagePath) : p.sourceUrl;
}

export function sortByYearDesc(rows: SnapshotVehicle[]): SnapshotVehicle[] {
  return [...rows].sort((a, b) => (b.vehicle.year ?? 0) - (a.vehicle.year ?? 0));
}

export function toSnapshotVehicle(row: VehicleRow): SnapshotVehicle {
  const photos = (row.photos ?? [])
    .map((p) => ({
      position: p.position,
      sourceUrl: p.source_url,
      storagePath: p.storage_path,
    }))
    .sort((a, b) => a.position - b.position);

  return {
    vehicle: row.payload as CatalogVehicle,
    status: row.status === "sold" ? "sold" : "online",
    photos,
  };
}

const SELECT = "id, payload, status, photos:catalog_photo(position, source_url, storage_path)";

/**
 * The public inventory: online vehicles that pass `siteVisible`, newest first.
 * One DB round-trip, versus the 20+ LesPAC calls a live fetch would cost.
 */
export async function listOnlineVehicles(): Promise<SnapshotVehicle[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("catalog_vehicle")
    .select(SELECT)
    .eq("status", "online");

  if (error) throw new Error(`snapshot read failed: ${error.message}`);

  const rows = ((data ?? []) as unknown as VehicleRow[]).map(toSnapshotVehicle);
  return sortByYearDesc(rows.filter((r) => siteVisible(r.vehicle)));
}

/**
 * One vehicle, sold ones included — an ad that left LesPAC still has links in
 * the wild (Google, Facebook, email), and a dead end serves nobody.
 */
export async function getSnapshotVehicle(id: string): Promise<SnapshotVehicle | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("catalog_vehicle")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`snapshot read failed: ${error.message}`);
  if (!data) return null;
  return toSnapshotVehicle(data as unknown as VehicleRow);
}
```

- [ ] **Step 4: Lancer le test**

Run: `pnpm vitest run tests/unit/catalog-read.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/catalog/read.ts tests/unit/catalog-read.test.ts
git commit -m "feat(catalog): snapshot read helpers for the public pages"
```

---

### Task 6: Worker de synchro

**Files:**
- Create: `worker/catalog-sync.ts`
- Modify: `tsconfig.worker.json` (ajouter `lib/catalog/**/*.ts` à `include`)
- Modify: `ecosystem.config.cjs` (nouvelle app `pacman-catalog-sync`)
- Modify: `package.json` (scripts `catalog:sync`)

**Interfaces:**
- Consumes: `runCatalogSync()` (Task 3), `createAdminClient()`.
- Produces: process pm2 `pacman-catalog-sync`; commande `pnpm catalog:sync` pour un passage unique.

Process **séparé** de `pacman-bot`: le bot miroir est une approche abandonnée et ne doit pas porter cette fonction.

- [ ] **Step 1: Écrire le worker**

`worker/catalog-sync.ts`:

```ts
/**
 * worker/catalog-sync.ts
 *
 * Refreshes the read-only LesPAC snapshot every CATALOG_SYNC_INTERVAL_SEC.
 * Independent of the mirror bot: that approach was abandoned, this one feeds the
 * public website.
 *
 * `--once` runs a single cycle and exits (used by `pnpm catalog:sync`).
 */

import { runCatalogSync } from "@/lib/catalog/snapshot";
import { createAdminClient } from "@/lib/supabase/admin";

const INTERVAL_SEC = Number.parseInt(process.env.CATALOG_SYNC_INTERVAL_SEC ?? "900", 10);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cycle(): Promise<void> {
  const supabase = createAdminClient();
  const r = await runCatalogSync(supabase);
  if (r.ok) {
    console.log(`[catalog-sync] ok — written=${r.written} sold=${r.sold}`);
  } else {
    console.error(`[catalog-sync] FAILED — snapshot kept — ${r.error}`);
  }
}

if (require.main === module) {
  const once = process.argv.includes("--once");
  let stopping = false;

  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      console.log(`[catalog-sync] ${sig} — stopping after current cycle`);
      stopping = true;
    });
  }

  void (async () => {
    console.log(`[catalog-sync] up — interval=${INTERVAL_SEC}s once=${once}`);
    do {
      const started = Date.now();
      try {
        await cycle();
      } catch (err) {
        // Never let the loop die: the next cycle may well succeed.
        console.error("[catalog-sync] cycle threw:", err);
      }
      if (once || stopping) break;
      await sleep(Math.max(0, INTERVAL_SEC * 1000 - (Date.now() - started)));
    } while (!stopping);
    console.log("[catalog-sync] stopped cleanly.");
  })();
}
```

- [ ] **Step 2: Étendre le tsconfig du worker**

Dans `tsconfig.worker.json`, remplacer le tableau `include` par:

```json
  "include": [
    "worker/**/*.ts",
    "lib/bot/**/*.ts",
    "lib/catalog/**/*.ts",
    "lib/lespac/**/*.ts",
    "lib/graph/**/*.ts",
    "lib/supabase/**/*.ts",
    "lib/dealer/**/*.ts"
  ]
```

- [ ] **Step 3: Ajouter les scripts pnpm**

Dans `package.json`, dans `scripts`, après `"bot:login"`:

```json
    "catalog:build": "tsc -p tsconfig.worker.json && tsc-alias -p tsconfig.worker.json",
    "catalog:sync": "pnpm catalog:build && node --env-file=.env.local worker/dist/worker/catalog-sync.js --once"
```

`--env-file=.env.local` est obligatoire: contrairement à `next start`, un process
Node nu ne charge pas `.env.local`, et `createAdminClient()` lève
`NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis` dès le démarrage.
Même convention que `scripts/resize-existing-photos.mjs` et `scripts/test-lespac.mjs`.

- [ ] **Step 4: Compiler le worker**

Run: `pnpm catalog:build`
Expected: compile sans erreur, `worker/dist/worker/catalog-sync.js` existe.

- [ ] **Step 5: Lancer une synchro réelle**

Run: `pnpm catalog:sync`
Expected: `[catalog-sync] ok — written=<N> sold=0` avec N ≈ 19-25.

Si la sortie est `FAILED`, lire le message: un lot vide ou une 401 signifie un problème de token LesPAC, pas un bug du worker — et le snapshot est resté intact, ce qui est le comportement voulu.

Vérifier en base avec le MCP Supabase `execute_sql`:

```sql
SELECT count(*) FILTER (WHERE status = 'online') AS online,
       count(*) FILTER (WHERE status = 'sold')   AS sold
FROM public.catalog_vehicle;
```

- [ ] **Step 6: Ajouter le process pm2**

Dans `ecosystem.config.cjs`, ajouter une troisième app après `pacman-bot`:

```js
    {
      name: "pacman-catalog-sync",
      script: "worker/dist/worker/catalog-sync.js",
      cwd: "/home/hino1/pacman",
      interpreter: "node",
      node_args: "--env-file=.env.local",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PATH: "/home/hino1/.npm-global/bin:/usr/local/bin:/usr/bin:/bin",
      },
      error_file: "/home/hino1/.pm2/logs/pacman-catalog-sync-error.log",
      out_file: "/home/hino1/.pm2/logs/pacman-catalog-sync-out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
```

- [ ] **Step 7: Démarrer le process**

Run: `pm2 start ecosystem.config.cjs --only pacman-catalog-sync && pm2 save && pm2 logs pacman-catalog-sync --lines 20 --nostream`
Expected: `[catalog-sync] up — interval=900s once=false` puis une ligne `ok`.

- [ ] **Step 8: Commit**

```bash
git add worker/catalog-sync.ts tsconfig.worker.json ecosystem.config.cjs package.json
git commit -m "feat(catalog): dedicated pm2 worker refreshing the snapshot"
```

---

### Task 7: Index `/vehicule`

**Files:**
- Create: `app/vehicule/page.tsx`
- Create: `app/vehicule/VehicleCard.tsx`
- Test: manuel (rendu de page)

**Interfaces:**
- Consumes: `listOnlineVehicles()`, `photoSrc()` (Task 5), `getDealerConfig()`, `telHref()`.
- Produces: la page indexée par `app/sitemap.ts` (Task 10) et embarquée en iframe (Task 9).

Le path `/vehicule` est choisi parce que la whitelist Cloudflare `^/(feeds|_next|vehicule)(/|$)` le laisse déjà passer grâce au `$` — aucune édition du tunnel qui sert Meta.

- [ ] **Step 1: Écrire la carte**

`app/vehicule/VehicleCard.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { photoSrc, type SnapshotVehicle } from "@/lib/catalog/read";

function displayTitle(v: SnapshotVehicle["vehicle"]): string {
  const parts = [v.year, v.make, v.model].filter((p) => p !== null && p !== "");
  return parts.join(" ").trim() || v.title;
}

function displayPrice(priceCad: number | null): string {
  if (priceCad == null) return "Prix à discuter";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(priceCad);
}

export function VehicleCard({ row }: { row: SnapshotVehicle }) {
  const v = row.vehicle;
  const hero = row.photos[0];
  const title = displayTitle(v);

  return (
    <li className="group overflow-hidden bg-[#141416] transition hover:bg-[#1a1a1d]">
      {/* New tab: the index is embedded in an iframe on camion-hino.ca, and the
          lead form must run full-page, not boxed inside it. */}
      <Link href={`/vehicule/${v.id}`} target="_blank" rel="noopener noreferrer">
        <div className="relative aspect-[4/3] overflow-hidden bg-black">
          {hero && (
            <Image
              src={photoSrc(hero)}
              alt={title}
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          )}
          <span className="absolute left-0 top-0 bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/70">
            {v.isNew ? "Neuf" : "Usagé"}
          </span>
        </div>
        <div className="p-4">
          <h2 className="text-lg font-bold uppercase leading-tight tracking-tight text-white">
            {title}
          </h2>
          <p className="mt-2">
            <span className="inline-block bg-[#ed1c24] px-3 py-1 text-lg font-bold tracking-tight text-white">
              {displayPrice(v.priceCad)}
            </span>
          </p>
          {v.km != null && (
            <p className="mt-2 text-sm text-white/50">
              {new Intl.NumberFormat("fr-CA").format(v.km)} km
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}
```

- [ ] **Step 2: Écrire la page**

`app/vehicule/page.tsx`:

```tsx
import type { Metadata } from "next";
import { Oswald } from "next/font/google";
import { listOnlineVehicles } from "@/lib/catalog/read";
import { getDealerConfig, telHref } from "@/lib/dealer/config";
import { VehicleCard } from "./VehicleCard";
import { FrameHeightReporter } from "./FrameHeightReporter";

export const revalidate = 300;

const oswald = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "Inventaire — Centre du camion Hino",
  description: "Camions et véhicules commerciaux disponibles chez Centre du camion Hino, Chicoutimi.",
};

export default async function InventoryPage() {
  const rows = await listOnlineVehicles();
  const dealer = getDealerConfig();
  const tel = telHref(dealer.contact.phone);

  return (
    <main className={`${oswald.className} min-h-screen bg-[#0e0e0f] text-white`}>
      <FrameHeightReporter />

      <header className="flex items-center justify-between border-b border-white/10 px-5 py-3 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="block h-6 w-6 bg-[#ed1c24]" aria-hidden />
          <span className="text-sm font-bold uppercase leading-none tracking-widest sm:text-base">
            Inventaire
            <span className="block text-[10px] font-medium tracking-[0.35em] text-white/50">
              {rows.length} véhicule{rows.length > 1 ? "s" : ""}
            </span>
          </span>
        </div>
        {dealer.contact.phone && (
          <a
            href={tel ?? undefined}
            className="text-sm font-semibold tracking-wide text-white/80 transition hover:text-white sm:text-base"
          >
            {dealer.contact.phone}
          </a>
        )}
      </header>

      {rows.length === 0 ? (
        <p className="px-5 py-16 text-center text-sm text-white/50">
          Aucun véhicule disponible pour le moment. Appelez-nous, l&apos;inventaire change vite.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <VehicleCard key={row.vehicle.id} row={row} />
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Créer le reporter de hauteur (stub pour l'instant)**

`app/vehicule/FrameHeightReporter.tsx` — le contenu réel arrive en Task 9. Stub minimal pour que la page compile:

```tsx
"use client";

export function FrameHeightReporter() {
  return null;
}
```

- [ ] **Step 4: Autoriser les images du bucket dans next/image**

Dans `next.config.ts`, ajouter dans `nextConfig`, avant `experimental`:

```ts
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
      { protocol: "https", hostname: "*.lespac.com" },
      { protocol: "https", hostname: "*.lespaccdn.com" },
    ],
  },
```

Si une image de l'index ne s'affiche pas, lire le hostname exact dans `catalog_photo.source_url` et l'ajouter ici — le fallback CDN doit rester fonctionnel quand un miroir a échoué.

- [ ] **Step 5: Vérifier le rendu**

```bash
pnpm build && pm2 restart pacman
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3005/vehicule
```

Expected: `200`.

Ouvrir `http://127.0.0.1:3005/vehicule` (ou via le tailnet) et vérifier: N cartes, photos visibles, prix rouge, « Prix à discuter » sur les annonces sans prix, clic → fiche en nouvel onglet.

- [ ] **Step 6: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add app/vehicule/page.tsx app/vehicule/VehicleCard.tsx app/vehicule/FrameHeightReporter.tsx next.config.ts
git commit -m "feat(inventaire): public index page at /vehicule"
```

---

### Task 8: Fiche sur snapshot + annonce retirée

**Files:**
- Modify: `app/vehicule/[id]/page.tsx`
- Test: manuel

**Interfaces:**
- Consumes: `getSnapshotVehicle()`, `photoSrc()` (Task 5).
- Produces: fiche servie depuis le snapshot; `status='sold'` → bandeau, pas de formulaire.

Pas de 301 sur repost: `vendorId` est null sur la majorité des annonces (saisie à la main), donc rien ne rattache l'ancien `listingId` au nouveau, et deviner redirigerait vers le mauvais camion. L'ancienne URL reste une page honnête.

- [ ] **Step 1: Remplacer la source de données**

Dans `app/vehicule/[id]/page.tsx`, remplacer:

```ts
import { getVehicleById } from "@/lib/catalog/fetch";
```

par:

```ts
import { getSnapshotVehicle, photoSrc } from "@/lib/catalog/read";
```

et remplacer:

```ts
const loadVehicle = cache(getVehicleById);
```

par:

```ts
/** One snapshot read per request, shared by generateMetadata and the component. */
const loadVehicle = cache(getSnapshotVehicle);
```

- [ ] **Step 2: Adapter `generateMetadata`**

Remplacer le corps par:

```ts
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const row = await loadVehicle(id);
  if (!row) notFound();

  const vehicle = row.vehicle;
  const title = displayTitle(vehicle);
  return {
    title: `${title} — ${getDealerConfig().name}`,
    description: vehicle.description.slice(0, 160) || title,
    // A withdrawn ad must not stay in the index competing with the live ones.
    robots: row.status === "sold" ? { index: false } : undefined,
    openGraph: {
      title,
      description: vehicle.description.slice(0, 200) || title,
      images: row.photos[0] ? [photoSrc(row.photos[0])] : [],
      type: "website",
    },
  };
}
```

- [ ] **Step 3: Adapter le composant de page**

Remplacer le début de `VehiclePage` par:

```tsx
export default async function VehiclePage({ params }: PageProps) {
  const { id } = await params;
  const row = await loadVehicle(id);
  if (!row) notFound();

  const vehicle = row.vehicle;
  const withdrawn = row.status === "sold";
  const dealer = getDealerConfig();
  const title = displayTitle(vehicle);
  const tel = telHref(dealer.contact.phone);
  const hero = row.photos[0] ? photoSrc(row.photos[0]) : undefined;
```

- [ ] **Step 4: Ajouter le bandeau et conditionner le formulaire**

Dans la section de droite, remplacer le bloc allant de `<div>` (celui contenant « Ce camion vous intéresse? ») jusqu'à `<LeadForm ... />` inclus par:

```tsx
          {withdrawn ? (
            <div className="border border-[#ed1c24]/40 bg-[#ed1c24]/10 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#ed1c24]">
                Cette annonce n&apos;est plus en ligne
              </p>
              <p className="mt-2 text-sm text-white/70">
                Ce véhicule a été vendu ou retiré. Voyez l&apos;inventaire à jour.
              </p>
              <a
                href="/vehicule"
                className="mt-3 inline-block bg-[#ed1c24] px-4 py-2 text-sm font-bold uppercase tracking-wide text-white"
              >
                Voir l&apos;inventaire
              </a>
            </div>
          ) : (
            <div>
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#ed1c24]">
                <span className="block h-3 w-3 bg-[#ed1c24]" aria-hidden />
                Ce camion vous intéresse?
              </p>
              <h2 className="mt-2 text-2xl font-bold uppercase leading-tight tracking-tight sm:text-3xl">
                Écrivez-nous, on vous répond vite
              </h2>
            </div>
          )}

          {vehicle.description && (
            <div className="max-h-40 overflow-y-auto rounded border border-white/10 bg-white/5 px-4 py-3 lg:max-h-48">
              <p className="whitespace-pre-line text-sm leading-relaxed text-white/70">
                {vehicle.description}
              </p>
            </div>
          )}

          {!withdrawn && <LeadForm unit={vehicle.id} title={title} />}
```

Le bloc `{vehicle.description && ...}` existant plus bas doit être supprimé pour ne pas être rendu deux fois.

- [ ] **Step 5: Vérifier**

```bash
pnpm build && pm2 restart pacman
ID=$(curl -s http://127.0.0.1:3005/vehicule | grep -o '/vehicule/[0-9]\+' | head -1 | cut -d/ -f3)
curl -s -o /dev/null -w "online:%{http_code}\n" http://127.0.0.1:3005/vehicule/$ID
curl -s -o /dev/null -w "inconnu:%{http_code}\n" http://127.0.0.1:3005/vehicule/999999999
```

Expected: `online:200`, `inconnu:404`.

Pour tester le cas retiré, passer un véhicule en `sold` via le MCP `execute_sql` (`UPDATE public.catalog_vehicle SET status='sold' WHERE id='<id>'`), recharger la fiche, vérifier le bandeau et l'absence de formulaire, puis remettre `status='online'`.

- [ ] **Step 6: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: aucune erreur.

- [ ] **Step 7: Commit**

```bash
git add "app/vehicule/[id]/page.tsx"
git commit -m "feat(fiche): read the snapshot and handle withdrawn ads"
```

---

### Task 9: Embed WordPress

**Files:**
- Modify: `app/vehicule/FrameHeightReporter.tsx` (remplace le stub de Task 7)
- Modify: `next.config.ts` (headers CSP)
- Create: `docs/embed-wordpress.md`

**Interfaces:**
- Consumes: la page `/vehicule` (Task 7).
- Produces: message `postMessage` de forme `{ source: "pacman-inventaire", height: number }`, consommé par le snippet WordPress.

- [ ] **Step 1: Implémenter le reporter de hauteur**

`app/vehicule/FrameHeightReporter.tsx`:

```tsx
"use client";

import { useEffect } from "react";

/**
 * Posts the document height to the WordPress parent so the iframe can grow with
 * the inventory. Without it the embed needs a fixed height and gets an inner
 * scrollbar — the flaw of the old Wix embed we are replacing.
 */
export function FrameHeightReporter() {
  useEffect(() => {
    if (window.parent === window) return;

    const post = () => {
      window.parent.postMessage(
        { source: "pacman-inventaire", height: document.documentElement.scrollHeight },
        "*",
      );
    };

    post();
    const observer = new ResizeObserver(post);
    observer.observe(document.documentElement);
    window.addEventListener("load", post);

    return () => {
      observer.disconnect();
      window.removeEventListener("load", post);
    };
  }, []);

  return null;
}
```

- [ ] **Step 2: Autoriser l'embed depuis camion-hino.ca**

Dans `next.config.ts`, ajouter à `nextConfig`:

```ts
  async headers() {
    return [
      {
        // Scoped to the inventory index on purpose: /feeds must not inherit a
        // CSP, and the vehicle detail page opens full-page, never framed.
        source: "/vehicule",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://camion-hino.ca https://www.camion-hino.ca",
          },
        ],
      },
    ];
  },
```

- [ ] **Step 3: Vérifier le header**

```bash
pnpm build && pm2 restart pacman
curl -sI http://127.0.0.1:3005/vehicule | grep -i content-security-policy
curl -sI http://127.0.0.1:3005/feeds/meta.csv | grep -ci content-security-policy
```

Expected: la première commande affiche la ligne `frame-ancestors`; la seconde affiche `0` — les feeds n'héritent d'aucun CSP.

- [ ] **Step 4: Écrire la doc d'embed**

`docs/embed-wordpress.md`:

````markdown
# Embed de l'inventaire sur camion-hino.ca (WordPress)

## Ce qu'on colle

Page WordPress « Inventaire » → bloc **HTML personnalisé** → ce code:

```html
<iframe
  id="pacman-inventaire"
  src="https://feeds.hinochicoutimi.com/vehicule"
  title="Inventaire — Centre du camion Hino"
  style="width:100%; border:0; display:block; min-height:900px;"
  scrolling="no"
></iframe>
<script>
  window.addEventListener("message", function (e) {
    if (e.origin !== "https://feeds.hinochicoutimi.com") return;
    if (!e.data || e.data.source !== "pacman-inventaire") return;
    var f = document.getElementById("pacman-inventaire");
    if (f) f.style.height = e.data.height + "px";
  });
</script>
```

Le `min-height` couvre le cas où le script ne s'exécute pas (bloqueur, cache
agressif): l'inventaire reste lisible, seulement moins haut.

Le contrôle d'origine dans le `if` est ce qui empêche n'importe quel site
d'injecter une hauteur. Ne pas le retirer.

## Ce qui doit être vrai côté app

- `/vehicule` répond `Content-Security-Policy: frame-ancestors 'self'
  https://camion-hino.ca https://www.camion-hino.ca` — sinon le navigateur
  refuse l'affichage. Défini dans `next.config.ts`.
- Le path `/vehicule` passe la whitelist Cloudflare
  `^/(feeds|_next|vehicule)(/|$)`. Aucune édition du tunnel n'est requise.

## Comportement attendu

- L'iframe grandit avec l'inventaire, pas de scroll interne.
- Un clic sur une carte ouvre la fiche en **nouvel onglet**, hors iframe: le
  formulaire de contact s'utilise en pleine page.

## Quand le sous-domaine arrivera

Voir `docs/superpowers/specs/2026-07-21-inventaire-site-web-design.md`, section
« Phase 2 ». Il faudra changer le `src` de l'iframe et l'origine vérifiée dans
le `if`, ou retirer l'iframe au profit d'un lien de menu vers
`inventaire.camion-hino.ca`.
````

- [ ] **Step 5: Commit**

```bash
git add app/vehicule/FrameHeightReporter.tsx next.config.ts docs/embed-wordpress.md
git commit -m "feat(inventaire): auto-resizing WordPress embed + frame-ancestors CSP"
```

---

### Task 10: robots.ts et sitemap.ts

**Files:**
- Modify: `app/robots.ts`
- Modify: `app/sitemap.ts`

**Interfaces:**
- Consumes: `listOnlineVehicles()` (Task 5), `resolveFeedOrigin()` de `lib/feeds/origin.ts` (lecture seule, pas de modification).
- Produces: un sitemap valide sur l'origine réellement servie.

Les deux fichiers sont périmés: ils annoncent `camion-hino.ca` alors que l'app est servie sur `feeds.hinochicoutimi.com`, et le sitemap ne liste que `/`, qui redirige vers `/dashboard` et répond donc 404 publiquement.

- [ ] **Step 1: Lire la signature de resolveFeedOrigin**

Run: `sed -n 1,40p lib/feeds/origin.ts`

Utiliser exactement la même forme d'appel que `lib/feeds/serve.ts:23-31`. Ne pas modifier `lib/feeds/origin.ts`.

- [ ] **Step 2: Réécrire robots.ts**

`app/robots.ts`:

```ts
import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { resolveFeedOrigin } from "@/lib/feeds/origin";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const origin = resolveFeedOrigin(
    process.env.FEED_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_URL,
    {
      forwardedHost: h.get("x-forwarded-host"),
      forwardedProto: h.get("x-forwarded-proto"),
      host: h.get("host"),
    },
  );

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/vehicule"],
        disallow: ["/dashboard", "/inventaire", "/auth/", "/api/"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
```

- [ ] **Step 3: Réécrire sitemap.ts**

`app/sitemap.ts`:

```ts
import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { resolveFeedOrigin } from "@/lib/feeds/origin";
import { listOnlineVehicles } from "@/lib/catalog/read";

export const revalidate = 900;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers();
  const origin = resolveFeedOrigin(
    process.env.FEED_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_URL,
    {
      forwardedHost: h.get("x-forwarded-host"),
      forwardedProto: h.get("x-forwarded-proto"),
      host: h.get("host"),
    },
  );

  // The home page redirects to /dashboard, which is 404 publicly — listing it
  // was the reason Google had nothing valid to crawl.
  const rows = await listOnlineVehicles();

  return [
    { url: `${origin}/vehicule`, changeFrequency: "daily", priority: 1 },
    ...rows.map((r) => ({
      url: `${origin}/vehicule/${r.vehicle.id}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
```

- [ ] **Step 4: Vérifier**

```bash
pnpm build && pm2 restart pacman
curl -s http://127.0.0.1:3005/robots.txt
curl -s http://127.0.0.1:3005/sitemap.xml | head -20
```

Expected: `robots.txt` contient `Allow: /vehicule` et une ligne `Sitemap:`; `sitemap.xml` liste `/vehicule` puis une entrée par véhicule en ligne.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add app/robots.ts app/sitemap.ts
git commit -m "fix(seo): robots + sitemap on the origin actually served"
```

---

### Task 11: Porte de sortie — prouver que Meta n'a pas bougé

**Files:**
- Modify: aucun (tâche de vérification)

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: la preuve que l'entrée du catalogue Meta est inchangée.

Cette tâche est la raison d'être du découpage en phases. Si un seul de ces contrôles échoue, ne pas livrer.

- [ ] **Step 1: Vérifier qu'aucun fichier de feed n'a été touché**

Run: `git diff 1987066 --stat -- lib/feeds app/feeds`
Expected: **sortie vide**. Un seul fichier listé = arrêt immédiat et retour en arrière sur ce fichier.

`1987066` est le HEAD d'avant la tâche 1, pas `main`: tout le système de feeds
(9 fichiers, 560 lignes) vit sur la branche `feat/meta-vehicle-feed` et n'est pas
mergé dans main. Comparer à main noierait notre diff dans du code de feed
préexistant et rendrait le contrôle inutilisable.

- [ ] **Step 2: Lancer toute la suite de tests**

Run: `pnpm test`
Expected: tous les tests passent, dont `feeds-eligibility`, `feeds-meta-vehicle-csv`, `feeds-meta-vehicle`, `feeds-google-vla`, `feeds-origin` — inchangés.

- [ ] **Step 3: Vérifier les feeds servis localement**

```bash
curl -sI http://127.0.0.1:3005/feeds/meta.csv | grep -Ei "^(HTTP|x-feed-|content-type)"
curl -s http://127.0.0.1:3005/feeds/meta.csv | head -3
curl -s http://127.0.0.1:3005/feeds/meta.csv | wc -l
```

Expected: `200`, `content-type: text/csv`, `X-Feed-Included` ≥ 1, et un nombre de lignes **non nul**. Un CSV vide est le mode d'échec exact du 2026-07-15 — ne pas livrer dans cet état.

- [ ] **Step 4: Vérifier les feeds servis à l'edge**

```bash
curl -sI https://feeds.hinochicoutimi.com/feeds/meta.csv | grep -Ei "^(HTTP|x-feed-)"
curl -s -o /dev/null -w "index:%{http_code}\n" https://feeds.hinochicoutimi.com/vehicule
curl -s -o /dev/null -w "dashboard:%{http_code}\n" https://feeds.hinochicoutimi.com/dashboard
```

Expected: feed `200` avec les mêmes compteurs qu'en local, `index:200`, `dashboard:404`. Le 404 sur `/dashboard` confirme que la whitelist Cloudflare n'a pas été élargie et que le coûtant reste inaccessible.

- [ ] **Step 5: Vérifier l'état de l'import côté Meta**

Contrôle manuel par le user dans Commerce Manager: la source de données du catalogue `Catalog_Vehicles` doit rester au statut importé, sans nouvelle erreur « Impossible d'importer le flux ». Aucune action automatisée ici — éditer ce catalogue en automatisation l'a déjà déstabilisé.

- [ ] **Step 6: Commit final**

```bash
git add -A
git commit -m "chore(inventaire): verification pass — feeds untouched, edge OK" --allow-empty
```

---

## Après le plan

Hors périmètre, documenté dans le spec, à ne pas entreprendre ici:

- Basculer `serveFeed()` sur le snapshot (avec fallback live, filtre `status='online'`, `vehicle_id` inchangé, URLs CDN conservées, test d'égalité octet pour octet).
- Migration DNS de `camion-hino.ca` vers Cloudflare et `inventaire.camion-hino.ca`.
- Filtres et recherche sur l'index.
