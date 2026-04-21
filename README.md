# camion-hino (interne)

Application de gestion inventaire Hino pour Pacman Camions. Usage interne seulement (Tailscale). Génère feeds pour publication Kijiji / Lespac / Facebook Marketplace.

## Stack

- Next.js 15 + TypeScript + Tailwind
- Supabase (Auth + DB)
- SERTI DB2 (read-only, source de vérité véhicules) — driver `node-jt400` (JDK requis)

## Dev local

```bash
pnpm install
cp .env.example .env.local  # remplir
pnpm dev
```

## Plans

Voir `docs/superpowers/plans/`.
