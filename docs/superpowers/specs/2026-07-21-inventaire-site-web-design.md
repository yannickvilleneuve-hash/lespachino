# Inventaire public sur camion-hino.ca — design

Date: 2026-07-21

## Contexte

Le dealer veut voir son inventaire sur son site web. Ça a déjà existé: un
`/embed/catalog` (liste compacte) affiché en iframe dans une page Wix, supprimé
le 2026-06-22 par `b8a5b2b chore: delete public catalogue, Wix embed/sync, and
lead capture`, quand pacman s'est réduit à la surface bot.

Trois choses ont changé depuis, et aucune ligne de l'ancien code n'est
réutilisable telle quelle:

1. Le site est passé de **Wix à WordPress/Apache** (`74.122.246.150`, NS GoDaddy).
2. L'app n'est plus servie par un Funnel Tailscale `:8443` mais par le **tunnel
   cloudflared `pacman-feeds`** sur `feeds.hinochicoutimi.com`, avec une
   whitelist de paths `^/(feeds|_next|vehicule)(/|$)` et un catch-all 404.
3. Les données ne viennent plus de Supabase `listing` (clé `unit`) mais de
   **LesPAC** (`lib/catalog/fetch.ts`, clé `listingId`).

Acquis à réutiliser: la fiche `/vehicule/[id]`, déjà brandée, avec formulaire de
lead fonctionnel (`747220a`, `6a32f53`, `48f2be4`).

## Contraintes

- **LesPAC = source de vérité.** Le dealer saisit ses annonces sur lespac.com et
  nulle part ailleurs. pacman ne doit jamais devenir une deuxième source
  d'écriture.
- **Rien ne doit casser du côté Meta.** La campagne « Camions Hino — Catalogue
  Saguenay » diffuse en ce moment à partir de `/feeds/meta.csv`. Précédent à ne
  pas répéter: le 2026-07-15 un `meta.csv` vide a fait échouer l'import Meta et
  gelé le catalogue avec 16 produits usagés dedans.
- Le coûtant SERTI n'entre pas dans cette feature: le catalogue LesPAC n'en
  contient pas.

## Problèmes du pipeline actuel

`fetchCatalog()` fait un `listAll` puis **un GET détail par annonce** (~20-25
appels séquentiels, sans cache), et chaque route feed le refait à chaque
revalidation. En découlent cinq limites qui décident l'architecture:

1. Une panne LesPAC ou un token expiré donne une page **vide**.
2. Les photos sont des **URLs CDN LesPAC en hotlink**; elles meurent avec
   l'annonce.
3. Une annonce qui sort de `listAll` disparaît sans laisser de trace: tout lien
   déjà en circulation (Google, Facebook, courriel) tombe sur un 404 sec.
4. La clé est le `listingId`, qui **change quand une annonce est repostée** —
   donc même un camion toujours en vente change d'URL.
5. `selectEligible()` est calibré pour les plateformes: il jette « prix à
   discuter » et les sans-photo. Sur notre propre site, cacher un camion parce
   que son prix est à discuter est un faux positif.

## Architecture: snapshot en lecture seule

Un job périodique appelle `fetchCatalog()` et **écrase** un snapshot Supabase.
Le site lit le snapshot, jamais LesPAC en direct.

Sens unique strict: la synchro écrase, aucune édition côté pacman, aucun conflit
possible par construction. LesPAC reste la vérité.

### Table

```sql
catalog_vehicle(
  id            text primary key,       -- listingId LesPAC
  payload       jsonb not null,         -- CatalogVehicle normalisé
  status        text not null,          -- 'online' | 'sold'
  first_seen_at timestamptz not null,
  last_seen_at  timestamptz not null,
  sold_at       timestamptz
)
catalog_photo(
  vehicle_id   text references catalog_vehicle(id),
  position     int,
  source_url   text not null,           -- CDN LesPAC, tel qu'émis dans les feeds
  storage_path text,                    -- miroir bucket vehicle-photos, null si pas encore copié
  primary key (vehicle_id, position)
)
catalog_sync(
  id          int primary key default 1,
  ran_at      timestamptz not null,
  ok          boolean not null,
  count       int not null,
  error       text
)
```

`catalog_sync` est un singleton: il porte la fraîcheur, que le garde-fou de la
phase 2 lira.

### Job de synchro

Nouveau process pm2 **`pacman-catalog-sync`** (`worker/catalog-sync.ts`, ajouté
à `ecosystem.config.cjs`), indépendant de `pacman-bot` — le bot miroir est une
approche abandonnée et ne doit pas porter cette fonction.

Boucle toutes les 15 min:

1. `fetchCatalog()`.
2. Si l'appel échoue ou retourne 0 véhicule: **on n'écrit rien**, on log, on
   enregistre `catalog_sync.ok = false`. Le snapshot précédent survit.
3. Sinon: upsert de chaque véhicule (`status='online'`, `last_seen_at=now()`),
   puis les ids absents du lot passent à `status='sold'`, `sold_at=now()`.
4. Les photos nouvelles sont copiées dans le bucket `vehicle-photos` sous
   `catalog/<id>/<position>.<ext>`; `source_url` est conservé intact.

Le point 2 est le cœur de la résilience: un lot vide ne détruit jamais le
snapshot.

### Ce que le snapshot débloque

- **20+ appels API → 1 requête DB** par rendu de page.
- **Photos à nous**: `next/image` optimise, plus de hotlink, plus de photo qui
  disparaît sous les pieds d'un visiteur.
- **Plus de 404 sec**: un id qui sort de LesPAC reste servi avec un message
  clair et un lien vers l'index, au lieu de perdre le visiteur.
- Le site survit à une panne LesPAC.

## Isolation de Meta

**Phase 1 — le snapshot ne touche pas les feeds.** `serveFeed()` continue
d'appeler `fetchCatalog()` en direct, ligne pour ligne inchangé. `meta.csv`,
`meta.xml` et `vehicles.xml` gardent exactement le comportement d'aujourd'hui.
Le risque Meta est nul par construction, pas par vérification. C'est le
périmètre livré.

**Phase 2 — hors périmètre de ce spec.** Basculer les feeds sur le snapshot
demandera, en préalable: un fallback live quand le snapshot est vide ou vieux de
plus de 2 h (jamais de feed vide), un `vehicle_id` qui reste le `listingId` brut
(les alias/301 servent au site uniquement), un filtre strict `status='online'`
dans le feed, la conservation des URLs CDN LesPAC comme `image` du feed, et un
test d'égalité octet pour octet entre le CSV généré depuis le snapshot et depuis
le live. Rien de tout ça n'est construit ici.

## Pages

### `/vehicule` — index

Le path est choisi pour une raison précise: la whitelist Cloudflare
`^/(feeds|_next|vehicule)(/|$)` laisse déjà passer `/vehicule` grâce au `$`.
Aucune édition du tunnel qui sert Meta n'est requise. `/inventaire` ou
`/vehicules` en exigeraient une.

Grille de cartes, triée par année décroissante. Par carte: photo hero, `année
make model`, prix en rouge (ou « Prix à discuter » affiché tel quel), km, badge
Neuf/Usagé. Transmission et carburant restent sur la fiche.

Règle de visibilité, distincte de `selectEligible()`: **véhicule + au moins une
photo**. Un camion sans prix s'affiche; un camion sans photo, non.

Pas de filtres. L'inventaire fait ~19-25 camions et tient en deux écrans de
scroll; une barre marque/année/prix serait de l'UI à maintenir pour un problème
inexistant. À revoir si l'inventaire double.

Style repris de la fiche: Oswald, rouge Hino.

### `/vehicule/[id]` — fiche

Lit le snapshot au lieu de `getVehicleById()`. Trois comportements:

- `status='online'` → inchangé (fiche + formulaire de lead).
- `status='sold'` → même fiche, bandeau **« Cette annonce n'est plus en
  ligne »**, formulaire retiré, lien vers l'index.
- id inconnu → 404.

Le bandeau dit « plus en ligne » et non « vendu », parce que les deux cas sont
indistinguables depuis LesPAC: une annonce sort de `listAll` aussi bien quand le
camion est vendu que quand le dealer la désactive et la reposte. Rien ne permet
de rattacher l'ancien `listingId` au nouveau — `vendorId` est null sur les
annonces saisies à la main, soit la majorité, et matcher sur année/marque/km
redirigerait tôt ou tard vers le mauvais camion. Donc pas de 301 sur repost:
l'ancienne URL reste une page honnête qui renvoie à l'index.

## Intégration au site

### Phase 1 — iframe WordPress

Bloc HTML custom dans une page WP « Inventaire », pointant
`https://feeds.hinochicoutimi.com/vehicule`. Deux écarts avec la version Wix:

- **Auto-resize**: l'index poste sa hauteur en `postMessage`, un snippet dans le
  bloc WP ajuste l'iframe. Plus de hauteur figée ni de double scroll.
- **CSP `frame-ancestors`** sur `/vehicule` autorisant `camion-hino.ca` et
  `www.camion-hino.ca`, via `headers()` dans `next.config.ts` — aucun header CSP
  n'y existe présentement. La règle ne couvre pas `/feeds`.

Clic sur une carte → fiche en nouvel onglet, hors iframe: le formulaire de lead
s'utilise donc en pleine page.

Le snippet WordPress (iframe + script de resize) est versionné dans
`docs/embed-wordpress.md` pour être copiable sans être réinventé.

### Phase 2 — `inventaire.camion-hino.ca`

Hors périmètre, documenté pour ne pas être re-décidé: la zone `camion-hino.ca`
est chez GoDaddy, et un tunnel cloudflared ne peut pas servir un hostname d'une
zone hors Cloudflare (un CNAME vers `cfargotunnel.com` ou vers
`feeds.hinochicoutimi.com` donne l'erreur 1014). Il faut donc migrer les
nameservers vers Cloudflare, en recopiant d'abord tous les records — en
particulier **MX/SPF/DKIM Microsoft 365**, puisque `service@camion-hino.ca`
envoie les notifications de lead.

La bascule se fera alors sans réécrire de code: changer `FEED_ORIGIN`, ajouter le
hostname au tunnel, 301 `feeds.hinochicoutimi.com/vehicule*` vers le nouveau
domaine. Les URLs produits du feed Meta suivront le changement d'origine — mise
à jour de champ, pas recréation de produit, mais à surveiller à l'import.

## Réparation au passage

`app/robots.ts` annonce `https://camion-hino.ca/sitemap.xml` alors que l'app est
servie sur `feeds.hinochicoutimi.com`, et `app/sitemap.ts` ne liste que `/`, qui
redirige vers `/dashboard` et donc répond 404 publiquement. Google n'a rien de
valide à indexer.

Correction: origine résolue dynamiquement avec le `resolveFeedOrigin()` déjà
utilisé par les feeds, et énumération des `/vehicule/[id]` `online` depuis le
snapshot. `/dashboard`, `/inventaire`, `/auth/`, `/api/` restent en `disallow`.

## Tests

- `catalog-snapshot.test.ts` — un lot vide ou une erreur LesPAC ne détruit pas le
  snapshot; un id absent du lot passe à `sold`; un id revenu repasse à `online`.
- `catalog-visibility.test.ts` — un véhicule sans prix est visible, un véhicule
  sans photo ne l'est pas, un non-véhicule ne l'est pas.
- `feeds-serve.test.ts` (existant) — reste vert sans modification, ce qui prouve
  que les feeds n'ont pas bougé.

## Hors périmètre

- Basculer les feeds sur le snapshot (phase 2 ci-haut).
- Migration DNS vers Cloudflare et `inventaire.camion-hino.ca`.
- Filtres et recherche sur l'index.
- Kijiji, AutoTrader.
- Toute écriture vers LesPAC.
