# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App Next.js qui tourne sur cette machine (`hino1@pacman`), accessible via Tailscale par toi + vendeurs. Login magic link. Page `/dashboard` affiche utilisateur connecté. Endpoint `/api/wgi/[vin]` retourne une vraie ligne depuis SERTI `WGI`. Code commité + pushé sur GitHub.

**Success criteria (tous verts avant Plan 2)**:
1. `pnpm dev` démarre sans erreur
2. Depuis un navigateur connecté au tailnet, ouvrir `http://<tailnet-ip>:3000` → page `/login`
3. Entrer courriel → recevoir magic link (Supabase) → cliquer → atterrir `/dashboard`
4. `/dashboard` affiche le courriel de l'utilisateur connecté
5. `curl http://<tailnet-ip>:3000/api/wgi/<VIN-RÉEL>` retourne JSON véhicule depuis SERTI
6. Repo pushé sur GitHub privé, CI (lint + tests unit) vert

**Architecture:** Next.js 15 App Router, TypeScript strict, Tailwind 4. Backend = Supabase (Auth + Postgres, pas encore Storage/schémas métier). SERTI accessible directement depuis Node — app tourne sur LAN avec SERTI joignable. Pas de Vercel, pas d'exposition publique. Accès via Tailscale seulement. Process = `pnpm dev` (foreground); passage en production manager (pm2/systemd) plus tard.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind 4, `@supabase/ssr`, `@supabase/supabase-js`, `node-jt400` (DB2 iSeries via JDBC/Java — confirmé Task 0), Vitest, GitHub Actions (lint + unit).

**Prérequis système:** JDK/JRE installé sur la machine (`node-jt400` → `node-java` → Java runtime). Vérifier `java -version` avant Task 5.

**Hors scope (plans ultérieurs):**
- Table `listing`, photos, RLS multi-rôle, admin UI
- Feeds publication (Kijiji/Lespac/FB) — Plan 3
- Tailscale Funnel pour exposer `/feed/*` publiquement — Plan 3
- Playwright E2E
- Production process manager
- Promote-admin script

---

## File Structure

**À créer:**

- `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `.gitignore`, `.env.example`, `README.md`, `.eslintrc.json`, `.prettierrc`, `vitest.config.ts`, `middleware.ts`
- `app/layout.tsx`, `app/globals.css`, `app/page.tsx`, `app/login/page.tsx`, `app/auth/callback/route.ts`, `app/dashboard/page.tsx`, `app/api/wgi/[vin]/route.ts`
- `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/supabase/middleware.ts`
- `lib/serti/client.ts`, `lib/serti/wgi.ts`
- `tests/unit/serti.wgi.test.ts`
- `.github/workflows/ci.yml`
- `docs/superpowers/research/serti-adapter-notes.md`

---

## Task 0: Découverte du patron SERTI (`calendrier-service`)

**Goal:** Connaître le driver DB2 réel + variables d'environnement + pattern de pool utilisés dans `calendrier-service`. Sans ça, Task 5 écrit dans le vide.

**Verify:** `docs/superpowers/research/serti-adapter-notes.md` existe, contient nom du package npm, extrait code connexion, liste exacte des variables env.

- [ ] **Step 1: Trouver le repo**

```bash
find ~ -type d -name "calendrier-service" -not -path "*/node_modules/*" 2>/dev/null | head
```

Si absent: demander à l'utilisateur le chemin local ou URL GitHub, puis `git clone` dans `/tmp/calendrier-service`.

- [ ] **Step 2: Extraire le patron**

Lire `package.json` (driver DB2) et fichier(s) qui se connectent à SERTI (`grep -r "SDSFC\|ibm_db\|odbc\|DSN" <repo>`).

- [ ] **Step 3: Écrire les notes**

`docs/superpowers/research/serti-adapter-notes.md`:

```markdown
# Notes SERTI — patron calendrier-service

**Driver npm**: <nom + version>
**Variables env attendues**:
- <VAR_1>
- <VAR_2>
- ...

**Snippet connexion**:
\`\`\`ts
<coller l'extrait>
\`\`\`

**Pièges connus**:
- <ex: libdb2.so.1 requis sur Linux>
- <ex: timeout long, prévoir pool>
```

- [ ] **Step 4: Staging (pas de commit — git init en Task 1)**

Garder le fichier, sera commité en Task 1 Step 3.

---

## Task 1: Git init + GitHub + `.gitignore` + README

**Goal:** Repo git local + remote GitHub privé + .gitignore correct.

**Verify:** `git remote -v` montre `origin`, `git push` réussit, repo visible dans compte GitHub.

- [ ] **Step 1: `.gitignore`**

```gitignore
node_modules/
.next/
out/
dist/
coverage/
*.log
.DS_Store

.env
.env.local
.env.*.local
!.env.example

.superpowers/brainstorm/*/state/
.superpowers/brainstorm/*/content/

.vscode/
.idea/
*.swp
```

- [ ] **Step 2: `README.md`**

```markdown
# camion-hino (interne)

Application de gestion inventaire Hino pour Pacman Camions. Usage interne seulement (Tailscale). Génère feeds pour publication Kijiji / Lespac / Facebook Marketplace.

## Stack

- Next.js 15 + TypeScript + Tailwind
- Supabase (Auth + DB)
- SERTI DB2 (read-only, source de vérité véhicules)

## Dev local

\`\`\`bash
pnpm install
cp .env.example .env.local  # remplir
pnpm dev
\`\`\`

## Plans

Voir `docs/superpowers/plans/`.
```

- [ ] **Step 3: Init + premier commit**

```bash
git init -b main
git add .gitignore README.md docs/superpowers/research/serti-adapter-notes.md
git commit -m "chore: init repo + notes SERTI"
```

- [ ] **Step 4: Créer repo GitHub**

Via tool `mcp__github__create_repository`:
- name: `camion-hino`
- description: `Gestion inventaire Hino + publication feeds (interne Pacman)`
- private: true
- auto_init: false

- [ ] **Step 5: Remote + push**

```bash
git remote add origin git@github.com:<user>/camion-hino.git
git push -u origin main
```

Expected: push succeeds, `main` branch visible sur GitHub.

---

## Task 2: Next.js scaffold

**Goal:** Next.js 15 + TS + Tailwind 4 démarrable.

**Verify:** `pnpm build` réussit; `pnpm dev` rend une page.

- [ ] **Step 1: Installer avec create-next-app**

```bash
pnpm dlx create-next-app@15 . \
  --typescript --tailwind --eslint --app \
  --src-dir false --import-alias "@/*" \
  --turbopack false --use-pnpm
```

Si prompts apparaissent malgré flags, accepter defaults.

- [ ] **Step 2: Nettoyer boilerplate**

Remplacer `app/page.tsx`:

```tsx
import { redirect } from "next/navigation";
export default function Home() { redirect("/login"); }
```

Supprimer `app/favicon.ico` si présent (optionnel).

- [ ] **Step 3: Ajouter scripts utiles**

Ajouter au `package.json`:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: Build check**

```bash
pnpm build
```

Expected: build succeeds, 0 error.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: scaffold Next.js 15 + TS + Tailwind"
git push
```

---

## Task 3: Vitest + .env.example + Prettier

**Goal:** Tests unit lancent. Variables env documentées.

**Verify:** `pnpm test` → 1 passed (smoke test).

- [ ] **Step 1: Installer**

```bash
pnpm add -D vitest @vitest/ui jsdom @vitejs/plugin-react prettier
```

- [ ] **Step 2: `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globals: true,
  },
  resolve: { alias: { "@": new URL("./", import.meta.url).pathname } },
});
```

- [ ] **Step 3: `.prettierrc`**

```json
{
  "semi": true,
  "trailingComma": "all",
  "singleQuote": false,
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 4: Smoke test**

`tests/unit/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("vitest runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run**

```bash
pnpm test
```

Expected: 1 passed.

- [ ] **Step 6: `.env.example`**

```
# Supabase (projet créé manuellement au dashboard)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# SERTI DB2 (mêmes noms que calendrier-service — NE PAS renommer)
SERTI_DB2_HOST=
SERTI_DB2_USER=
SERTI_DB2_PASS=
```

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "chore: setup Vitest + Prettier + env example"
git push
```

---

## Task 4: Supabase + login magic link + dashboard

**Goal:** Utilisateur s'authentifie par magic link, `/dashboard` affiche son courriel. Routes `/dashboard` protégées.

**Verify:** cycle complet login → dashboard → logout fonctionne en dev local.

- [ ] **Step 1: Créer projet Supabase (manuel)**

Utilisateur va sur https://supabase.com/dashboard → new project:
- Nom: `camion-hino`
- Region: proche (Canada Central ou us-east)

Copier `Project URL` et `anon public key` dans `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Dans Supabase dashboard → Authentication → URL Configuration:
- Site URL: `http://localhost:3000`
- Redirect URLs: `http://localhost:3000/auth/callback`, `http://<tailnet-hostname>:3000/auth/callback` (ajouter plus tard)

- [ ] **Step 2: Installer libs**

```bash
pnpm add @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 3: Clients Supabase**

`lib/supabase/client.ts`:

```ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

`lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (items) => {
          try {
            items.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // appelé depuis Server Component — ignorer
          }
        },
      },
    },
  );
}
```

`lib/supabase/middleware.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (items) => {
          items.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          items.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const needsAuth = request.nextUrl.pathname.startsWith("/dashboard");

  if (needsAuth && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}
```

`middleware.ts`:

```ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 4: Login page**

`app/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setErr(error.message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={onSubmit} className="bg-white p-8 rounded shadow w-full max-w-sm">
        <h1 className="text-xl font-semibold mb-4">Connexion</h1>
        <label className="block text-sm mb-1">Courriel</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded px-3 py-2 mb-4"
          disabled={status === "sending"}
        />
        <button
          type="submit"
          disabled={status === "sending"}
          className="w-full bg-blue-700 text-white py-2 rounded disabled:opacity-50"
        >
          {status === "sending" ? "Envoi..." : "Recevoir lien magique"}
        </button>
        {status === "sent" && (
          <p className="text-green-700 text-sm mt-3">Lien envoyé. Vérifie tes courriels.</p>
        )}
        {status === "error" && <p className="text-red-600 text-sm mt-3">{err}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Callback**

`app/auth/callback/route.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/dashboard`);
  }
  return NextResponse.redirect(`${origin}/login?error=callback`);
}
```

- [ ] **Step 6: Dashboard**

`app/dashboard/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-semibold">Camion Hino — Interne</h1>
        <form action="/auth/signout" method="post">
          <button type="submit" className="text-sm text-gray-600 hover:underline">
            Déconnexion
          </button>
        </form>
      </header>
      <section className="bg-white p-6 rounded shadow">
        <p className="text-sm text-gray-600">Connecté en tant que</p>
        <p className="text-lg font-medium">{user.email}</p>
      </section>
    </main>
  );
}
```

- [ ] **Step 7: Route signout**

`app/auth/signout/route.ts`:

```ts
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url));
}
```

- [ ] **Step 8: Typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: 0 errors.

- [ ] **Step 9: Test manuel local**

```bash
pnpm dev
```

1. Ouvrir http://localhost:3000 → redirige `/login`
2. Entrer courriel → cliquer bouton → message "Lien envoyé"
3. Vérifier courriel → cliquer lien → atterrir `/dashboard`
4. Dashboard affiche courriel
5. Cliquer Déconnexion → retour `/login`

Si un pas rate, fix avant commit.

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "feat(auth): magic link login + protected dashboard"
git push
```

---

## Task 5: SERTI adapter + endpoint `/api/wgi/[vin]`

**Goal:** Endpoint retourne vrais champs WGI depuis SERTI DB2.

**Verify:** `curl http://localhost:3000/api/wgi/<VIN-RÉEL>` → JSON véhicule. `curl /api/wgi/INCONNU` → 404.

**Prérequis:** notes de Task 0 à portée. Driver identifié.

- [ ] **Step 1: Vérifier Java + installer driver**

```bash
java -version
```

Si absent: `sudo apt install -y default-jre-headless` (Linux Debian/Ubuntu).

```bash
pnpm add node-jt400@^6.0.1
```

- [ ] **Step 2: Confirmer nom colonnes WGI via MCP**

Via tool `mcp__serti__query`:

```sql
SELECT * FROM SDSFC.WGI FETCH FIRST 1 ROWS ONLY
```

Noter noms exacts des colonnes (VIN, make, model, année, km, prix). Ajuster Steps 4-6 avec les vrais noms.

**Note table**: calendrier-service utilise `SDSFC.VEM` (véhicules client pour service). Notre app utilise `SDSFC.WGI` (inventaire dealer — 262 unités confirmées au brainstorm). Tables différentes, même schéma `SDSFC`.

- [ ] **Step 3: Client pool (`node-jt400`)**

`lib/serti/client.ts`:

```ts
import jt400 from "node-jt400";

type Pool = ReturnType<typeof jt400.pool>;
let poolInstance: Pool | null = null;

function getPool(): Pool {
  if (poolInstance) return poolInstance;
  const { SERTI_DB2_HOST, SERTI_DB2_USER, SERTI_DB2_PASS } = process.env;
  if (!SERTI_DB2_HOST || !SERTI_DB2_USER || !SERTI_DB2_PASS) {
    throw new Error("SERTI_DB2_HOST / SERTI_DB2_USER / SERTI_DB2_PASS requis");
  }
  poolInstance = jt400.pool({
    host: SERTI_DB2_HOST,
    user: SERTI_DB2_USER,
    password: SERTI_DB2_PASS,
    naming: "sql",
    maxPoolSize: 8,
  });
  return poolInstance;
}

export async function queryOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const pool = getPool();
  const rows = await pool.query<T>(sql, params as never);
  return rows[0] ?? null;
}

export async function sertiHealthCheck(): Promise<boolean> {
  try {
    await getPool().query("SELECT 1 FROM SYSIBM.SYSDUMMY1");
    return true;
  } catch {
    return false;
  }
}
```

Notes:
- **Pas de fallback hardcodé** (contrairement à calendrier-service qui a `10.20.2.246`/`YANNICK`/`SDS` en fallback). On fail hard sans env — évite fuites.
- `node-jt400` supporte prepared statements via params `?`. Utiliser. calendrier-service concatène SQL — on fait mieux ici.
- `naming: 'sql'` indispensable pour syntaxe `SDSFC.WGI` (sinon JT400 attend `SDSFC/WGI`).

- [ ] **Step 4: Test unit (failing)**

`tests/unit/serti.wgi.test.ts` — squelette à compléter avec vrais noms de colonnes découverts Step 2:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/serti/client", () => ({ queryOne: vi.fn() }));

import { getVehicleByVin } from "@/lib/serti/wgi";
import { queryOne } from "@/lib/serti/client";

describe("getVehicleByVin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mappe une ligne WGI vers Vehicle", async () => {
    // Remplacer les clés par les vrais noms de colonne WGI de Step 2
    (queryOne as ReturnType<typeof vi.fn>).mockResolvedValue({
      WGIVIN: "ABC123", WGIMAK: "HINO", WGIMOD: "L7", WGIYER: 2021, WGIKMS: 145000,
    });
    const v = await getVehicleByVin("ABC123");
    expect(v).toEqual({ vin: "ABC123", make: "HINO", model: "L7", year: 2021, km: 145000 });
  });

  it("retourne null si pas trouvé", async () => {
    (queryOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect(await getVehicleByVin("X")).toBeNull();
  });
});
```

- [ ] **Step 5: Run (fails)**

```bash
pnpm test
```

Expected: FAIL — `getVehicleByVin` not defined.

- [ ] **Step 6: Implémentation**

`lib/serti/wgi.ts`:

```ts
import { queryOne } from "./client";

export interface Vehicle {
  vin: string;
  make: string;
  model: string;
  year: number;
  km: number;
}

interface WgiRow {
  WGIVIN: string;
  WGIMAK: string;
  WGIMOD: string;
  WGIYER: number;
  WGIKMS: number;
}

export async function getVehicleByVin(vin: string): Promise<Vehicle | null> {
  const row = await queryOne<WgiRow>(
    "SELECT WGIVIN, WGIMAK, WGIMOD, WGIYER, WGIKMS FROM SDSFC.WGI WHERE WGIVIN = ?",
    [vin],
  );
  if (!row) return null;
  return {
    vin: row.WGIVIN, make: row.WGIMAK, model: row.WGIMOD,
    year: row.WGIYER, km: row.WGIKMS,
  };
}
```

Colonnes à remplacer par les vrais noms confirmés Step 2 (le mock test suit aussi).

- [ ] **Step 7: Run (passes)**

```bash
pnpm test
```

Expected: 2 passed.

- [ ] **Step 8: Route handler**

`app/api/wgi/[vin]/route.ts`:

```ts
import { getVehicleByVin } from "@/lib/serti/wgi";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ vin: string }> },
) {
  const { vin } = await params;
  const vehicle = await getVehicleByVin(vin);
  if (!vehicle) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(vehicle);
}
```

- [ ] **Step 9: Test live en dev**

```bash
pnpm dev
```

Dans autre terminal, avec un VIN pris via `mcp__serti__query SELECT WGIVIN FROM WGI FETCH FIRST 1 ROWS ONLY`:

```bash
curl http://localhost:3000/api/wgi/<VIN-RÉEL>
```

Expected: JSON `{ vin, make, model, year, km }`.

```bash
curl http://localhost:3000/api/wgi/INCONNU-XXX
```

Expected: HTTP 404, `{"error":"not_found"}`.

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "feat(serti): GET /api/wgi/[vin] reads from SERTI WGI"
git push
```

---

## Task 6: Accès via Tailscale + CI GitHub Actions

**Goal:** Autres machines du tailnet peuvent ouvrir l'app. CI lance lint + unit tests sur push.

**Verify:** `curl http://<tailnet-hostname>:3000/api/wgi/<VIN>` depuis laptop vendeur → JSON véhicule. CI verte sur `main`.

- [ ] **Step 1: Vérifier Tailscale**

```bash
tailscale status
```

Si pas installé ou pas up, demander utilisateur d'installer et se connecter au tailnet. Noter le hostname magic DNS (ex: `pacman.tail1234.ts.net`) ou l'IP tailnet (ex: `100.x.y.z`).

- [ ] **Step 2: Bind Next.js à 0.0.0.0**

Modifier `package.json` script `dev`:

```json
"dev": "next dev -H 0.0.0.0 -p 3000"
```

Pour exposer aux autres machines du tailnet. Tailscale gère ACL — sans tailnet, pas joignable.

- [ ] **Step 3: Ajouter tailnet URL aux redirect Supabase**

Dans dashboard Supabase → Authentication → URL Config → Redirect URLs, ajouter:
- `http://<tailnet-hostname>:3000/auth/callback`
- `http://<tailnet-ip>:3000/auth/callback`

- [ ] **Step 4: Test depuis autre machine du tailnet**

Sur laptop vendeur (dans tailnet):
- Ouvrir `http://<tailnet-hostname>:3000` → `/login`
- Login full cycle doit passer

- [ ] **Step 5: CI GitHub Actions (simple)**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
        env:
          NEXT_PUBLIC_SUPABASE_URL: http://dummy.local
          NEXT_PUBLIC_SUPABASE_ANON_KEY: dummy
```

Note: `node-jt400` dépend de `node-java` qui compile via node-gyp et a besoin d'un JDK. Ubuntu runner GitHub Actions a OpenJDK 11/17 préinstallé — vérifier. Si install échoue, ajouter step `apt-get install -y default-jdk` OU installer via `actions/setup-java@v4` avant `pnpm install`.

- [ ] **Step 6: Commit + vérifier CI**

```bash
git add .
git commit -m "ci: lint + typecheck + unit tests on push"
git push
```

Observer GitHub Actions tab: workflow doit passer vert. Si échec `ibm_db`, appliquer fix (b) et re-push.

---

## Self-Review (après exécution)

- [ ] **Success criteria** (haut du plan) tous verts
- [ ] Aucun placeholder TODO/TBD dans code livré
- [ ] Noms cohérents: `createClient` (Supabase), `queryOne`, `getVehicleByVin`
- [ ] Toutes les tâches commitées + pushées
- [ ] Notes SERTI décrivent le vrai driver utilisé

---

## Prochain plan (Plan 2 — admin + listings)

Presuppose Plan 1 vert. Plan 2 ajoutera:
- Schéma Supabase (`listing`, `vehicle_photo`, `merlin_cost`)
- RLS 2 rôles (admin, vendeur)
- Page `/inventaire` — liste WGI enrichi (style Option A)
- Page `/inventaire/[vin]/edit` — prix, desc, photos
- Upload photos Supabase Storage
- Merlin cost (privé)
