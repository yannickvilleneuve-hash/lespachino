# camion-hino (ventes — interne + vitrine publique)

Application multi-sous-systèmes pour Pacman Camions Hino:

- **Interne (authentifié, tailnet)**: gestion d'inventaire, prix, photos,
  publication multi-canal.
- **Public (anon, planifié pour `camion-hino.ca`)**: catalogue type Lespac,
  fiches véhicules avec formulaire de rappel, feeds XML/CSV pour Meta et
  Google, plus sync API vers Wix/Lespac.

## Stack

- **Next.js 16** (App Router, Turbopack, Server Actions) + TypeScript strict +
  Tailwind 4
- **Supabase** (Postgres + Auth + Storage privé/public)
- **SERTI DB2** (iSeries) read-only via `node-jt400` — JDK requis
- **Microsoft Graph API** (Azure AD tenant Pacman) pour envois courriel
  depuis `service@camion-hino.ca`
- **pm2** pour process management

## Prérequis serveur

```bash
# Java (node-jt400 → node-java → JNI)
sudo apt install -y default-jre-headless

# pnpm + Node 22+
corepack enable
corepack prepare pnpm@latest --activate
```

## Dev local

```bash
pnpm install
cp .env.example .env.local   # remplir — voir section Environnement
pnpm dev                     # http://localhost:3005
# OU sous pm2 (voir Production):
pm2 start ecosystem.config.cjs
```

Variables `.env.local` critiques:

| Groupe | Vars | Source |
|---|---|---|
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API |
| SERTI | `SERTI_DB2_HOST/USER/PASS` | Config partagée avec calendrier-service |
| Graph | `GRAPH_TENANT/CLIENT/SECRET/FROM` | Azure AD app enregistrée (même que calendrier) |
| Site | `NEXT_PUBLIC_SITE_URL`, `ADMIN_SITE_URL` | URLs publique + admin |
| Dealer | `DEALER_*` | nom, adresse, contact pour feeds et boutons |

## Production (pm2)

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 logs pacman --lines 100
pm2 restart pacman            # après refactor / cache Turbopack foireux
```

Auto-restart sur crash (max 20 retries, 3s delay, 1G RAM cap).

## Base de données — migrations Supabase

Les migrations SQL sont dans `supabase/migrations/`. Elles sont appliquées
via le Supabase MCP côté Claude Code (`apply_migration`). Pour appliquer
manuellement:

```bash
psql "$DATABASE_URL" -f supabase/migrations/20260422*.sql
```

Schéma actuel (résumé):

- `public.listing(unit PK, price_cad, description_fr, is_published, channels[], hidden)`
- `public.vehicle_photo(id UUID PK, unit FK, storage_path UNIQUE, position, is_hero)`
- `public.lead(id UUID PK, unit, name, phone, email, status, notes, next_follow_up_at, ip_hash, ...)`
- `public.publication_job(id UUID PK, unit, channel, action, status, last_error, ...)`
- Storage bucket `vehicle-photos` public (cataloge) + RLS policies

**PK = unit (WGIUNM)** et non VIN — SERTI contient des VINs dupliqués en
pratique. Voir `supabase/migrations/20260422141500_switch_to_unit_pk.sql`.

## Scripts utilitaires

```bash
# Génère 3 placeholder photos par véhicule actif (SVG→JPEG via sharp).
node --env-file=.env.local scripts/seed-placeholder-photos.mjs --limit=20

# Force regen (même si déjà photographié):
node --env-file=.env.local scripts/seed-placeholder-photos.mjs --limit=20 --force
```

## Routes

### Interne (auth requise — middleware redirige vers `/login`)

- `/dashboard` — point d'entrée
- `/dashboard/publication-jobs` — jobs par canal, erreurs, relances
- `/inventaire` — liste + filtres + tri
- `/inventaire/[unit]` — édition prix/desc/canaux, photos (dnd-kit), publier
- `/api/wgi/[vin]` — lookup direct SERTI authentifié (legacy Plan 1)

### Public (anon)

- `/` — catalogue compact style Lespac (Option A)
- `/vehicule/[unit]` — fiche publique, galerie, form rappel
- `/feed/native.json` — feed JSON du site natif
- `/feed/facebook.csv` + `/feed/facebook.xml` — Meta Automotive Inventory Ads
- `/feed/vehicles.xml` — Google Vehicle Listings Ads
- `/robots.txt` + `/sitemap.xml`

## Tests + CI

```bash
pnpm test          # Vitest unit tests
pnpm typecheck     # tsc --noEmit
pnpm lint          # ESLint
pnpm build         # next build, production
```

CI: GitHub Actions (`.github/workflows/ci.yml`) lance les 4 ci-haut sur
push. Installe JDK 21 (Temurin) pour node-jt400.

## Docs

- Plans exécutables: `docs/superpowers/plans/`
- Notes SERTI: `docs/superpowers/research/serti-adapter-notes.md`
- Agent instructions: `AGENTS.md` (et `CLAUDE.md` alias)

## Licensing

Usage interne Pacman Camions. Non distribué.
