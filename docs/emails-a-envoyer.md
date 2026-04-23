# Courriels à envoyer — débloque les intégrations

Copie-colle tel quel. Tous sont rédigés de façon courte et professionnelle,
adaptés au contact.

---

## 1. GoDaddy — demander accès délégué

**À envoyer à**: le propriétaire du compte GoDaddy pour `camion-hino.ca`
(probablement Pacman IT / la personne qui a enregistré le domaine).

**Sujet**: Accès délégué GoDaddy pour DNS camion-hino.ca

```
Bonjour,

On met en place le nouveau site interne de gestion de l'inventaire
(catalogue public + feeds Kijiji/Lespac/Facebook).

Pour ça on a besoin d'ajouter 5 records DNS au domaine camion-hino.ca
chez GoDaddy:
  - 1 MX (routage mail vers O365)
  - 1 TXT SPF (deliverability outbound)
  - 1 TXT DMARC
  - 2 CNAME DKIM (anti-spoofing signing)

Deux options:

OPTION A — tu m'ajoutes en « Delegate Access »
  - Va sur account.godaddy.com → Account Settings → Delegate Access
  - Add Delegate: mon adresse yannick.villeneuve@gmail.com
  - Niveau « Products and Domains » (ou « Everything »)
  - Je touche seulement DNS, pas la facturation

OPTION B — tu ajoutes les 5 records toi-même
  - Je te passe les valeurs exactes à copier-coller
  - ~10 minutes dans l'interface GoDaddy

Laisse-moi savoir ce qui marche pour toi.

Merci!
— Yannick
```

---

## 2. Kijiji Dealer Support — obtenir la spec XML feed

**À envoyer à**: `dealers@kijiji.ca` (ou via formulaire dans Dealer Central
si tu as déjà accès).

**Sujet**: Demande spec XML feed integration — concessionnaire existant

```
Bonjour,

Je suis responsable du département ventes chez Centre du camion Hino
(Pacman Camions, Montréal) — concessionnaire dealer.

On développe notre propre système de gestion d'inventaire et on aimerait
alimenter nos annonces Kijiji par flux XML automatique plutôt que par
saisie manuelle.

Pouvez-vous me transmettre:
  1. La spécification technique officielle de votre feed XML dealer
     (schema XSD + exemple complet)
  2. L'URL où Kijiji pulle le feed (ou le flow d'upload)
  3. Les prérequis d'onboarding et délais typiques
  4. Si un frais additionnel est associé à l'intégration feed
     (vs. saisie Dealer Central)

Volume: ~70 véhicules actifs, catégories camions commerciaux
neufs/usagés + boîtes + remorques.

Je peux fournir nos credentials dealer si utile.

Merci!
— Yannick Villeneuve
  Centre du camion Hino — Pacman Camions
  <téléphone>
```

---

## 3. Lespac Support — obtenir la spec + partenariat dealer

**À envoyer à**: `contact@lespac.com` ou formulaire dealer sur
`lespac.com/en/contact` si dispo. Noter que Lespac est maintenant sous
TRADER — ils pourraient te rediriger vers AutoSync.

**Sujet**: Partenariat concessionnaire + feed XML inventaire

```
Bonjour,

Centre du camion Hino (Pacman Camions, Montréal) est concessionnaire de
camions commerciaux. On est en train de bâtir un système de gestion
d'inventaire interne et on aimerait publier automatiquement nos véhicules
sur Lespac via flux XML, plutôt que par saisie manuelle.

Pouvez-vous me transmettre:
  1. Les options d'abonnement dealer incluant le feed automatique
  2. La spécification du flux XML (schema + exemple)
  3. Pricing mensuel
  4. Les catégories supportées (camions commerciaux, boîtes, remorques)

Volume prévu: ~70 véhicules actifs.

Si Lespac est maintenant géré via TRADER AutoSync, merci de me rediriger
au bon contact.

Merci!
— Yannick Villeneuve
  Centre du camion Hino — Pacman Camions
  <téléphone>
```

---

## 4. TRADER Corporation — demande de devis AutoSync

**À appeler**: 1-877-414-2030 (Dealer Sales).
**Email** (si tu préfères): via `tradercorporation.com/contact/`.

**Points à couvrir à l'appel** (ne pas lire verbatim, guide de conversation):

```
Intro:
  « Bonjour, je m'appelle Yannick, de Centre du camion Hino à Montréal.
  Concessionnaire camions commerciaux Hino. On évalue un outil de
  syndication d'inventaire et j'aimerais un devis AutoSync. »

Questions à leur poser:

  1. Quel package couvre syndication vers AutoTrader.ca + Lespac + Kijiji
     (3 canaux essentiels pour nous)?
  2. Est-ce que les camions commerciaux (Hino, boîtes, remorques) sont
     supportés avec les mêmes features que voitures passagers?
  3. Pricing mensuel pour ~70 véhicules actifs (mix neufs/usagés)?
  4. Format feed d'entrée accepté: on a un flux JSON custom. Est-ce que
     vous l'acceptez ou faut-il transformer en XML/CSV spécifique?
  5. Support photos: combien max par véhicule? URL externes OK ou upload?
  6. Engagement contractuel: mensuel ou annuel?
  7. Combien de temps entre sign-up et live sur les 3 plateformes?
  8. Il y a-t-il un module CRM / leads unifié inclus, ou c'est séparé?

Info à partager avec eux:
  - ~70 véhicules actifs (A dans SERTI)
  - Catégories: camions neufs + usagés, boîtes de camion, remorques
  - DMS actuel: SERTI iSeries (on extrait l'inventaire nous-mêmes)
  - Photos hébergées chez nous (Supabase Storage)
  - Pas besoin de site vitrine — on a le nôtre

Ne pas signer à l'appel — demander proposition écrite.
```

---

## Suivi

Quand tu reçois réponse de:

| Source | Action |
|---|---|
| GoDaddy owner | Tu me dis « accès donné », je vérifie + ajoute les records |
| Kijiji | Tu me forwardes la spec XML, je remplace le stub 501 |
| Lespac | Idem — forward + je remplace le stub |
| TRADER | Tu me partages le devis, on décide si on passe par eux ou combo DIY |
