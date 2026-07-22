# Carrousel des camions en stock sur l'accueil — design

Date: 2026-07-22
Statut: approuvé par le user (contenu, interaction, hauteur)

## Le problème

L'accueil de `camion-hino.ca` (page WordPress **59**) montre, sous « des camions
pour tous vos besoins », un visuel **L7 générique**: une image de catalogue qui ne
dit rien de ce qui est réellement à vendre. L'inventaire réel vit déjà dans le
snapshot LesPAC de Supabase et s'affiche sur `/inventaire` depuis le 2026-07-21.

On remplace le visuel générique par une bande des camions réellement en stock.

## Décisions

| Question | Choix | Pourquoi |
|---|---|---|
| Contenu | **8 véhicules les plus récents** + tuile « voir tout » | Une accroche, pas un second inventaire. 21 cartes sur l'accueil ferait doublon avec `/inventaire` et chargerait 21 images. |
| Interaction | **Glissement manuel**, `scroll-snap` + flèches | Aucun mouvement automatique: pas de carte qui s'échappe sous les yeux du lecteur, rien à mettre en pause pour l'accessibilité, et le doigt marche nativement sur mobile. |
| Hauteur | **380 px fixes** | Une bande à hauteur constante se marie avec une iframe à hauteur fixe. L'auto-resize `postMessage` de `/vehicule` n'a plus de raison d'être ici. |

## Architecture

### Route

`app/vehicule/carrousel/page.tsx` → `/vehicule/carrousel`.

Le segment statique l'emporte sur `[id]` dans Next; les ids LesPAC sont numériques,
donc aucune collision possible. Choisi plutôt qu'un `/carrousel` à la racine parce
que la whitelist du tunnel Cloudflare (`^/(feeds|_next|vehicule)(/|$)`) le couvre
**déjà**: aucune édition de tunnel, aucune fenêtre où l'URL répondrait 404.

`export const revalidate = 300`, comme `/vehicule`.

### Données

```
listOnlineVehicles()            // existant: snapshot, siteVisible, tri année desc
  └─ pickCarouselVehicles(rows) // nouveau, pur: les N premiers
```

`lib/catalog/carousel.ts` — module minuscule et testable, séparé de `read.ts` qui
approche déjà 330 lignes. Aucun appel LesPAC supplémentaire: une lecture du
snapshot, la même que l'index.

### Composants

- `app/vehicule/format.ts` — `displayTitle` et `displayPrice`, **extraits** de
  `VehicleCard`. Deux cartes doivent formater un prix de la même façon; dupliquer
  le « Prix à discuter » serait le laisser diverger.
- `app/vehicule/carrousel/CarouselCard.tsx` — serveur. Carte de largeur fixe
  (260 px), image 4/3, prix en pastille rouge. Même langage visuel que l'index.
- `app/vehicule/carrousel/CarouselTrack.tsx` — client. Conteneur `scroll-snap` +
  deux flèches qui appellent `scrollBy`. Reçoit les cartes en `children`: elles
  restent rendues côté serveur. Aucun état, aucun autoplay.
- `VehicleCard` (grille) n'est pas touchée au-delà de l'import des formateurs.

### Liens

- Une carte → `/vehicule/[id]`, `target="_blank"` — comme l'index, parce que le
  formulaire de contact doit s'ouvrir pleine page et non dans l'iframe.
- Tuile « voir tout l'inventaire » → `target="_top"` vers
  `https://camion-hino.ca/inventaire`: on sort de l'iframe, on ne met pas une page
  dans une page. URL surchargée par `SITE_INVENTORY_URL` au besoin.

### Indexation

`robots: { index: false, follow: true }`. La bande est un fragment sans en-tête
ni navigation, fait pour être encadré: indexée, elle concurrencerait la vraie
page d'inventaire dans les résultats avec un contenu plus pauvre.

### Sécurité / en-têtes

`next.config.ts` déclare `frame-ancestors` avec `source: "/vehicule"` **exact**, ce
qui ne couvre pas le sous-chemin. Ajouter une entrée `/vehicule/carrousel` avec la
même valeur. Sans elle, le navigateur refuse d'afficher la bande dans WordPress.

### Comportement en cas d'erreur

Différent de `/vehicule`, volontairement: la page publique de l'inventaire peut se
permettre une erreur serveur, une accroche encadrée dans l'accueil non.

- `listOnlineVehicles()` qui lance → bloc de repli (téléphone + lien inventaire),
  **jamais** un 500 encadré au milieu de l'accueil.
- Zéro véhicule visible → le même bloc de repli, à la même hauteur: pas de trou de
  380 px dans la page.

## Tests (vitest)

- `pickCarouselVehicles`: respecte la limite, préserve l'ordre reçu, supporte une
  liste plus courte que la limite et une liste vide.
- Formateurs: `priceCad: null` → « Prix à discuter »; titre reconstruit depuis
  année/marque/modèle, repli sur `title` quand les trois manquent.

## Hors périmètre

- Le collage du bloc dans WordPress (page 59) est une étape séparée, avec
  comparaison visuelle avant/après.
- `lib/feeds/` et `app/feeds/` ne sont pas touchés: campagne Meta en production.
- Aucun redimensionnement d'image côté serveur (déjà hors périmètre projet).
