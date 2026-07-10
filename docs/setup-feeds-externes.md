# Setup feeds externes — Meta Commerce Manager + Google Merchant Center

> **Réécrit 2026-07-10.** Les feeds sont maintenant alimentés par LesPAC (source de
> vérité), plus par SERTI/Supabase. Les anciennes URLs `/feed/*` n'existent plus.

URLs publiques actuelles (Tailscale Funnel, port 8443):

| Feed | URL | Usage |
|---|---|---|
| Meta Vehicles | `https://hino1-thinkcentre-m93p.tail0e1ea8.ts.net:8443/feeds/meta.xml` | Meta Commerce Manager |
| Google VLA | `https://hino1-thinkcentre-m93p.tail0e1ea8.ts.net:8443/feeds/vehicles.xml` | Google Merchant Center, agrégateurs |
| Page véhicule | `.../vehicule/<listingId>` | Cible crawlée par les deux feeds |

Le Funnel n'expose que `/feeds`, `/vehicule` et `/_next`. **Le dashboard n'a plus
d'authentification** (retirée dans `4b6fb9e`) et reste volontairement hors du Funnel:
il s'atteint sur `https://hino1-thinkcentre-m93p.tail0e1ea8.ts.net:9443/dashboard`,
tailnet seulement. Ne jamais monter `/` sur le port 8443.

L'origine émise dans les feeds vient de `FEED_ORIGIN` (`.env.local`). Elle doit être
joignable **depuis l'extérieur du tailnet**: sinon Meta avale le feed puis échoue les
20 pages d'atterrissage, et le diagnostic n'apparaît que des jours plus tard.
`NEXT_PUBLIC_SITE_URL` pointe encore vers `feeds.hinochicoutimi.com`, qui répond 525.

Vérifier après tout changement d'exposition:

```bash
curl -sI https://<origin>/feeds/meta.xml     # 200, application/xml
curl -sI https://<origin>/vehicule/<id>      # 200
curl -sI https://<origin>/dashboard          # 404 — sinon l'admin est public
```

Diagnostic dans les en-têtes: `X-Feed-Total`, `X-Feed-Included`, `X-Feed-Skipped`,
`X-Feed-Warnings`. Le détail (quelle annonce, pourquoi) part dans les logs pm2.

---

## 1. Meta Commerce Manager (Facebook Marketplace + Ads)

### Étape 1 — Crée le catalogue Vehicles

1. https://business.facebook.com → **Commerce Manager** (sidebar)
2. Clique **Catalogs** → **Create catalog**
3. Type: **Vehicles** (PAS "Commerce" ni "Ads" génériques)
4. Name: `Centre du camion Hino — Inventaire`
5. Owner: ton Business Manager
6. Clique **Create**

### Étape 2 — Ajoute le data feed

1. Dans ton catalogue → **Data Sources** → **Add Items** → **Use bulk upload**
2. Choisis **Scheduled feed**
3. **Data feed URL**: colle
   ```
   https://hino1-thinkcentre-m93p.tail0e1ea8.ts.net:8443/feeds/meta.xml
   ```
4. Username/Password: laisse vide (public)
5. **Upload hours**: Daily (ou Hourly pour refresh rapide)
6. Upload time: 07:00 America/Toronto (avant début journée)
7. **Currency**: CAD
8. Clique **Upload**

### Étape 3 — Vérifie

- Attends 5-10 min que Meta pulle le feed
- **Diagnostics** tab → vérifie "Processing complete" sans erreur
- Si erreur sur `mileage` (<500mi), les véhicules NEUFS (`state_of_vehicle=NEW`)
  sont exemptés — pas d'action requise. Les USAGÉS <500mi sont rejetés légitimement.

### Étape 4 — Active Automotive Inventory Ads

1. Ads Manager → **Create** → Campaign objective: **Sales** ou **Awareness**
2. **Catalog**: sélectionne le catalogue créé
3. Crée un Ad Set ciblant les intéressés camions commerciaux au Québec
4. Review + launch

---

## 2. Google Merchant Center — Vehicle Listings Ads

### Étape 1 — Crée un compte Merchant Center

1. https://merchants.google.com → **Get started**
2. Business info: Centre du camion Hino / Pacman Camions
3. Country: Canada
4. Type: **Vehicle dealer**
5. Verify website (TXT record OU balise meta — besoin accès site camion-hino.ca
   ou onglet métadonnée via Google Search Console)

### Étape 2 — Ajoute le feed

1. Merchant Center → **Products** → **Feeds** → **Add primary feed**
2. Country: Canada · Language: French (Canadian)
3. Destination: **Vehicle Ads**
4. Feed name: `camion-hino-vehicles`
5. Input method: **Scheduled fetch**
6. **File URL**:
   ```
   https://hino1-thinkcentre-m93p.tail0e1ea8.ts.net:8443/feed/vehicles.xml
   ```
7. Frequency: Daily · 07:00 Toronto
8. Save + wait for first fetch

### Étape 3 — Campagne Vehicle Ads (Google Ads)

1. Google Ads → Campaigns → New → **Vehicle ads**
2. Link Merchant Center account → select vehicle feed
3. Budget + ciblage Canada
4. Launch

---

## 3. Monitoring post-setup

Après le premier pull:

- `/inventaire` → colonnes **Vues 7j** + **Leads 7j** montent
- `/inventaire/leads` → les leads des form contact arrivent
- Courriels arrivent à `service@camion-hino.ca` + CC `yannick.villeneuve@gmail.com`

Si pas de trafic après 48h:
- Meta: Diagnostics tab → voir erreurs validation
- Google: Merchant Center → Overview → feed status
- Check console serveur: `pm2 logs pacman --lines 50`

---

## 4. Migration URL finale

Quand `camion-hino.ca` DNS sera débloquée (accès GoDaddy obtenu):

1. Dans `.env.local`: `NEXT_PUBLIC_SITE_URL=https://camion-hino.ca`
2. `pm2 restart pacman --update-env`
3. Dans Meta Commerce Manager → Data Sources → Edit → change URL
4. Idem Google Merchant Center → Feeds → Settings → URL

Les feeds regénéreront avec nouvelles URLs `/vehicule/[unit]`.

---

## 5. Sandhills / MarketBook / TruckPaper

Le portail `https://vip.marketbook.ca/import` est protégé par Cloudflare. Pour
automatiser proprement, il faut demander à Sandhills de tirer notre feed public
sur horaire plutôt que d'automatiser le portail.

URL à fournir:

```text
https://feeds.hinochicoutimi.com/feed/sandhills.csv
```

Voir [sandhills-automation.md](./sandhills-automation.md) pour le message à
envoyer au représentant Sandhills et les alternatives SFTP/API si nécessaires.
