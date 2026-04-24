# Intégration native Wix — Collection Inventaire

Notre app pousse les véhicules publiés dans une Wix Collection via leur
Data API. Le site Wix `camion-hino.ca` consomme cette collection avec
un composant Repeater/Gallery natif — look et feel 100% Wix, pas d'iframe.

## État actuel

- ✅ Collection créée: `Inventaire` (ID: `Inventaire`)
- ✅ Site ID: `45583e1f-4d0f-4d74-b74b-a03f0691da43`
- ✅ Sync push fonctionnel (testé avec B4210)
- ⏳ Layout Wix à construire par toi dans l'Editor

## Champs de la collection

| Clé Wix | Type | Exemple |
|---|---|---|
| `_id` | string | `B4210` (notre unit#) |
| `title` | TEXT | `2024 HINO L7` |
| `unit` | TEXT | `B4210` |
| `vin` | TEXT | `2472478` |
| `year` | NUMBER | 2024 |
| `make` | TEXT | `HINO` |
| `model` | TEXT | `L7` |
| `category` | TEXT | `CAMION NEUF` |
| `km` | NUMBER | 10 |
| `color` | TEXT | `BLANC` |
| `priceCad` | NUMBER | 29995 |
| `descriptionFr` | RICH_TEXT | `Camion 26 pieds...` |
| `state` | TEXT | `NEW` \| `USED` |
| `heroImage` | IMAGE | URL Supabase publique |
| `imageUrls` | ARRAY_STRING | URLs toutes les photos |
| `detailUrl` | URL | Notre fiche /vehicule/[unit] |
| `dateAdded` | DATETIME | ISO 8601 |

## Workflow admin

1. Dans `/inventaire`: édite prix, desc, photos, publie (is_published=true)
2. Clique **Sync Wix** dans le header → pousse toutes les lignes publiées
3. Les dépubliées/cachées sont retirées de Wix automatiquement
4. Bouton apparaît seulement si `WIX_API_TOKEN` + `WIX_SITE_ID` sont configurés

## Layout côté Wix Editor

### Étape 1 — Crée une page "Inventaire"

1. Wix Editor → sidebar Pages → **+ Add Page** → Blank
2. Nom: "Inventaire", URL slug: `/inventaire`
3. Ajoute au menu principal

### Étape 2 — Connecte le repeater à la collection

1. Add → **CMS** → **Repeater** (tu peux aussi utiliser Gallery/Grid)
2. Choisir "Connect to Data" → pick collection **Inventaire**
3. Filter: none (ou state=NEW pour afficher que le neuf)
4. Sort: `dateAdded` DESC (plus récent en haut)

### Étape 3 — Mappe les champs aux éléments

Dans chaque item du Repeater:

- **Image** → connect to `heroImage`
- **Title text** → connect to `title`
- **Price text** → connect to `priceCad` (add prefix "$" + format number)
- **Details text** → connect to `category` or custom
- **Button "Voir détails"** → link to `detailUrl` (opens new tab)

### Étape 4 — Filtres interactifs (optionnel)

Wix Editor a des composants natifs pour filter/trier une collection:
- Dropdown "Année" → filters `year`
- Dropdown "Marque" → filters `make`
- Dropdown "État" → filters `state`

Drag ces composants → Connect to Data → Filter Repeater.

### Étape 5 — Publish

Wix Editor → **Publish** (top right). Ton URL finale: `https://www.camion-hino.ca/inventaire`.

## Sync automatique (optionnel, plus tard)

Actuellement sync manuel par bouton. Pour auto-sync à chaque changement:
- Déclencher `runWixSync()` depuis `upsertListing`, `togglePublished`, `setHidden`
- OU cron job `pm2` qui sync toutes les 10 min

## Limites connues

- Wix plan **Premium** (déjà actif sur `camion-hino.ca`) — Data API requires paid plan
- Le Wix plan gratuit ne permet PAS la Data API externe
- Rate limit Wix API: ~1000 req/min — largement suffisant pour 66 véhicules
- Sync durée: ~1-2 sec par véhicule (incluant SERTI lookup)

## Comparaison avec iframe `/embed/catalog`

| Aspect | Wix natif (Option 1) | Iframe (déjà fait) |
|---|---|---|
| Look | Wix design complet | Notre design dans un cadre |
| SEO | Indexé comme page Wix | Indirect |
| Filtres | Wix natif | JS custom dans iframe |
| Effort Wix | Repeater à construire | 1 widget iframe |
| Sync latence | Sync manuel (ou auto) | Live (iframe pull) |
| Sortir de l'iframe | N/A | Nouveau tab obligatoire |

Tu peux garder l'iframe `/embed/catalog` comme backup ou tester, et
construire le Wix natif en parallèle.
