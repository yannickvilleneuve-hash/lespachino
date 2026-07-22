# Blindage du pipeline — design

Date: 2026-07-22
Statut: approuvé par le user (plancher + repli snapshot · chien de garde hors machine · alerte Graph)

## Le problème

Le pipeline LesPAC → snapshot → site → Meta fonctionne, mais **ses pannes sont
muettes**. Deux constats mesurés le 2026-07-22:

1. `serveFeed()` construit le feed depuis un appel **live** à LesPAC. Si l'API
   répond 200 avec une liste vide ou tronquée — jeton révoqué, compte suspendu,
   panne partielle — nous servons **0 ou 3 véhicules en HTTP 200**. Meta ne voit
   pas d'erreur: il **vide le catalogue** et les publicités s'arrêtent.
   Un 500 franc serait moins dangereux qu'un 200 amaigri.
2. Rien n'alerte. Le seul système d'alerte du dépôt (`lib/bot/alerter.ts`)
   appartient au bot miroir abandonné. Le seul signal d'un worker mort est une
   tuile de tableau de bord — et personne ne regarde un tableau de bord qui va
   bien.

« Blindé » ne veut pas dire increvable: Cloudflare, LesPAC ou Supabase peuvent
tomber sans qu'on y puisse rien. Ça veut dire: **ne jamais publier un mensonge,
et ne jamais tomber en silence.**

## 1. Plancher du feed

Décision portée par une fonction **pure**, `chooseFeedSource(live, snapshot)`:

| Condition | Source servie | Code |
|---|---|---|
| `live >= FLOOR_RATIO * snapshot` | live (comportement actuel) | 200 |
| live effondré, snapshot utilisable | **snapshot Supabase** | 200 |
| les deux sous le minimum absolu | rien | **503 + `Retry-After`** |

- `FLOOR_RATIO = 0.8`, `MIN_ABSOLUTE = 1`.
- Le snapshot est déjà en base et vieux d'au plus 15 minutes: servir hier vaut
  mieux que publier le vide.
- 503 plutôt que 200-vide: Meta conserve sa dernière copie valide.
- L'en-tête `X-Feed-Source: live|snapshot` accompagne la réponse — c'est ce que
  le chien de garde et un humain liront pour savoir ce qui s'est passé.

## 2. Chien de garde, hors de la machine

**Edge Function Supabase** `pipeline-watchdog`, déclenchée par `pg_cron` (via
`pg_net`) toutes les 15 minutes. Elle vit hors du serveur surveillé: un chien de
garde local se tait précisément quand la machine brûle.

Elle:
1. appelle `https://feeds.hinochicoutimi.com/feeds/meta.csv` et lit le statut,
   `X-Feed-Included` et `X-Feed-Source` (en-têtes déjà émis par le code);
2. lit `catalog_sync` (fraîcheur, `ok`, `error`);
3. écrit un enregistrement dans `watchdog_check`;
4. **envoie elle-même le courriel** via Graph, avec les secrets stockés côté
   Supabase. Une alerte qui passerait par notre app se tairait exactement quand
   la machine est morte.

Verdicts: `OK`, `FEED_DOWN` (statut ≠ 200), `FEED_THIN` (items sous le plancher),
`FEED_DEGRADED` (servi depuis le snapshot), `SYNC_STALE` (> 45 min),
`SYNC_FAILING` (`ok = false`).

Anti-harcèlement: alerte au **deuxième** verdict rouge consécutif; ensuite **une
relance par 24 h** tant que la panne dure; **courriel de rétablissement** au
retour au vert.

## 3. Surveiller le surveillant

Tuile `/dashboard` lisant le dernier `watchdog_check`: date, verdict, détail.
Sans elle, un chien de garde arrêté remplacerait une panne muette par une autre.
Absence d'enregistrement récent = **ambre**, jamais vert.

## Hors périmètre

- **Aucun redémarrage à distance.** Donner à Supabase le pouvoir d'agir sur la
  machine ouvre une porte plus grande que le problème réglé; pm2 relance déjà ce
  qui plante et `pm2-hino1.service` couvre le redémarrage machine.
- Pas de SMS pour l'instant (à rouvrir si un fournisseur est déjà en place).
- Pas de nettoyage des photos orphelines (19 Mo, sans urgence).

## Tests

- `chooseFeedSource`: live sain, live effondré, live vide, snapshot vide, les
  deux vides, ratio pile au seuil, valeurs négatives.
- Verdicts du chien de garde: fonction pure testée hors réseau.
- Anti-harcèlement: deuxième échec consécutif, silence pendant 24 h, message de
  rétablissement.
