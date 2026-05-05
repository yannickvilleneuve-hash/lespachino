# Automatisation Sandhills / MarketBook / TruckPaper

Le portail `https://vip.marketbook.ca/import` est protégé par Cloudflare.
Il ne doit pas être automatisé par navigateur headless: c'est fragile, bloqué
par design, et ça peut arrêter sans préavis.

La solution durable est un import planifié côté Sandhills.

## URL canonique

Demander à Sandhills de configurer un import planifié depuis:

```text
https://feeds.hinochicoutimi.com/feed/sandhills.csv
```

Ce feed contient tous les véhicules sélectionnés pour au moins une plateforme
Sandhills (`TruckPaper` ou `MarketBook`) et évite les doublons.

Feeds individuels disponibles si Sandhills préfère séparer:

```text
https://feeds.hinochicoutimi.com/feed/truckpaper.csv
https://feeds.hinochicoutimi.com/feed/marketbook.csv
```

## Paramètres à demander

- Import automatique toutes les 1 à 4 heures, ou au minimum quotidien.
- Mapping par `stock_number` comme identifiant unique.
- Mise à jour des unités existantes quand le même `stock_number` revient.
- Retrait/désactivation des unités absentes du feed, si Sandhills supporte ce mode.
- Rapport d'import par courriel ou écran `Import History`.

## Message à envoyer au représentant Sandhills

```text
Bonjour,

Nous voulons automatiser l'import de notre inventaire dans Sandhills Inventory
Management / MarketBook / TruckPaper.

Pouvez-vous configurer un import planifié depuis cette URL CSV publique?

https://feeds.hinochicoutimi.com/feed/sandhills.csv

Identifiant unique: stock_number
Fréquence souhaitée: aux 1 à 4 heures si possible, sinon quotidiennement.

Merci de nous confirmer:
1. que le feed est bien récupéré automatiquement;
2. l'heure du dernier import;
3. où consulter les erreurs ou rejets d'import;
4. si les unités absentes du feed sont automatiquement retirées/désactivées.

Merci.
```

## Si Sandhills refuse le pull URL

Demander une des options suivantes:

1. Accès SFTP/FTP pour déposer `sandhills-inventory.csv`.
2. Endpoint API officiel avec authentification.
3. Adresse courriel technique acceptant les fichiers CSV automatisés.

Avec une de ces options, Pacman peut pousser le même contenu automatiquement
par script/cron sans passer par le portail web.
