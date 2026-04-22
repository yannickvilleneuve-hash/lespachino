<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

Next.js **16** with Turbopack. Breaking changes vs older versions:

- `params`/`searchParams` are `Promise<...>` in Server Components. Always `await`.
- `middleware.ts` déprécié au profit de `proxy.ts` — on utilise encore
  `middleware.ts` pour l'instant mais à migrer.
- `cookies()` from `next/headers` retourne une Promise. Toujours `await`.
- `serverExternalPackages` (pas `experimental.serverComponentsExternalPackages`)
  pour exclure native modules du bundle (ex: `node-jt400`, `java`).
- `allowedDevOrigins` requis pour accès dev via tailnet/hostname custom.

Consulte `node_modules/next/dist/docs/` avant d'écrire. Heed les deprecation
notices dans le terminal.
<!-- END:nextjs-agent-rules -->

# Architecture pacman — pour futurs agents

## Sources de données

- **SERTI DB2** (`SDSFC.WGI`, read-only via `node-jt400`) = source de vérité
  pour identité véhicule + coûtant (`WGICST`).
- **Supabase** (`public.listing`, `public.vehicle_photo`, `public.lead`,
  bucket `vehicle-photos`) = couche mise-en-vente par-dessus SERTI.
- **PK dealer = `WGIUNM` (unit#)**, PAS `WGISER` (VIN) — SERTI contient des
  VINs dupliqués en pratique.

## Règles non-négociables

- `WGICST` (coûtant) JAMAIS exposé au catalogue public. Utiliser
  `PublicVehicle = Omit<Vehicle, "cost">` + `stripCost()`.
- Admin UI affiche le coûtant en rouge, label "ne pas divulguer".
- RLS: `listing`/`vehicle_photo`/`lead` — `authenticated` full access,
  `anon` INSERT seulement sur `lead`. Les routes publiques utilisent
  `createAdminClient()` (service_role, bypass RLS) mais strip le coûtant
  côté lib.

## Mailing

- Magic link auth: **Graph API** (`lib/graph/mail.ts`) depuis
  `service@camion-hino.ca` — PAS de Supabase SMTP. Rate limit par IP
  géré dans Supabase lui-même.
- Leads: même pattern Graph, `to: service@`, `cc: tous les auth users`.
  Rate limit anti-spam en mémoire 5/h/IP dans `lib/leads/actions.ts`.

## Schéma Supabase

```sql
-- PK = unit (not vin)
listing(unit, price_cad, description_fr, is_published, channels[],
        hidden, updated_by, created_at, updated_at)
vehicle_photo(id, unit, storage_path, position, is_hero, uploaded_by, uploaded_at)
lead(id, unit, name, phone, email, message, ip_hash, user_agent, created_at)
```

## Conventions de nommage

- Fetchers: `fetch*`, `getBy*`
- Server Actions: verbes imperatif (`upsertListing`, `togglePublished`,
  `submitLead`)
- Clients Supabase: `createClient()` (cookie-aware) vs
  `createAdminClient()` (service_role).

## Dev workflow

- Dev server: `pm2 restart pacman` après changements structurels. HMR
  couvre les changements de code.
- Migrations: SQL dans `supabase/migrations/` + `apply_migration` MCP.
  Régénérer types après: `generate_typescript_types` MCP.
- Tests: `pnpm test` (vitest). Ajoute systématiquement 1-2 tests par
  nouveau module serveur-critique.
- Lint + typecheck avant chaque commit.

## Hors scope actuel

- Rôles admin/vendeur séparés (Plan 4)
- DNS `camion-hino.ca` public + Tailscale Funnel (bloqué accès GoDaddy)
- Feeds Kijiji/Lespac (spec requise — stubs retournent 501)
- Photo resize serveur (Plan 5 optim)
