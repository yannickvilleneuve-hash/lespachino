# Embed de l'inventaire sur camion-hino.ca (WordPress)

## Ce qu'on colle

Page WordPress « Inventaire » → bloc **HTML personnalisé** → ce code:

```html
<iframe
  id="pacman-inventaire"
  src="https://feeds.hinochicoutimi.com/vehicule"
  title="Inventaire — Centre du camion Hino"
  style="width:100%; border:0; display:block; min-height:900px;"
  scrolling="no"
></iframe>
<script>
  window.addEventListener("message", function (e) {
    if (e.origin !== "https://feeds.hinochicoutimi.com") return;
    if (!e.data || e.data.source !== "pacman-inventaire") return;
    var f = document.getElementById("pacman-inventaire");
    if (f) f.style.height = e.data.height + "px";
  });
</script>
```

**Le script n'est pas optionnel tel que l'iframe est écrite ici.** Avec
`scrolling="no"`, si le listener `message` ne s'exécute pas — script bloqué,
extension, CSP du thème, erreur JS ailleurs dans la page — le cadre est **coupé
net** à `min-height`, pas rendu scrollable: le visiteur voit 2 camions sur 21 et
n'a aucun moyen d'atteindre les autres. Le `min-height` limite les dégâts, il ne
dégrade pas gracieusement.

Si tu veux une version sans script, il faut aussi rendre le scroll interne au
cadre, sinon tu perds l'inventaire:

```html
<iframe src="https://feeds.hinochicoutimi.com/vehicule"
  title="Inventaire — Centre du camion Hino"
  style="width:100%;border:0;display:block;height:4200px"
  scrolling="auto" loading="lazy"></iframe>
```

Hauteur fixe généreuse, scroll interne autorisé. Ça marche, c'est simplement
moins propre: du vide en bas quand l'inventaire rétrécit, une barre de défilement
imbriquée quand il grossit.

Le contrôle d'origine dans le `if` est ce qui empêche n'importe quel site
d'injecter une hauteur. Ne pas le retirer.

## Ce qui doit être vrai côté app

- `/vehicule` répond `Content-Security-Policy: frame-ancestors 'self'
  https://camion-hino.ca https://www.camion-hino.ca` — sinon le navigateur
  refuse l'affichage. Défini dans `next.config.ts`.
- Le path `/vehicule` passe la whitelist Cloudflare
  `^/(feeds|_next|vehicule)(/|$)`. Aucune édition du tunnel n'est requise.

## Comportement attendu

- L'iframe grandit avec l'inventaire, pas de scroll interne.
- Un clic sur une carte ouvre la fiche en **nouvel onglet**, hors iframe: le
  formulaire de contact s'utilise en pleine page.

## Le carrousel de l'accueil (page 59) — shortcode, plus d'iframe

**Historique.** La bande était une iframe vers `/vehicule/carrousel`, relayée
par WordPress via `/stock/` (PHP → cURL → tunnel → app). Mesuré en prod le
2026-09-16: ~0,8 s par requête, ~20 requêtes par affichage (HTML, chunks,
fonts, images), et `loading="lazy"` qui ne démarrait le tout qu'une fois la
section à l'écran. Résultat: 2,5 à 3 s de trou noir, que le visiteur dépassait
avant que les camions apparaissent.

**Maintenant.** L'app expose `/feeds/carrousel.json` (8 camions, titre et prix
déjà formatés, photo Supabase, lien absolu). Un mu-plugin WordPress lit ce JSON
au plus une fois toutes les 5 minutes et rend les cartes en HTML natif dans la
page d'accueil. Pour le visiteur: zéro requête vers l'app, les cartes sont dans
le HTML de la page, les photos partent en même temps que le reste.

Installation:

1. Copier `wordpress/mu-plugins/hino-carrousel.php` dans
   `wp-content/mu-plugins/` (cPanel → File Manager; créer le dossier au
   besoin). Actif d'office, rien à activer.
2. Facultatif, dans `wp-config.php`:
   `define('HINO_CARROUSEL_PHONE', '418 xxx-xxxx');` — affiché dans le bloc de
   repli si l'app n'a jamais répondu.
3. Rien à faire dans la page d'accueil: le mu-plugin remplace lui-même
   l'iframe `/vehicule/carrousel` (filtre `the_content`) dès que le JSON a
   répondu une fois. Tant que l'app n'est pas déployée, l'iframe reste en
   place. Au besoin, `[hino_carrousel]` dans un bloc **Code court** fait la
   même chose ailleurs.
4. Retirer le relais `/stock/` côté WordPress (plugin ou code du thème qui
   proxie vers l'app): il ne sert plus à rien et chaque requête qui y tombe
   démarre WordPress au complet.

Comportement en panne: si l'app ne répond pas, WordPress garde la dernière copie
valide indéfiniment — la page d'accueil ne montre jamais un trou. Un JSON vide
ou invalide n'est jamais enregistré. Le rafraîchissement se fait par WP-Cron en
arrière-plan; aucun visiteur n'attend l'app, sauf le tout premier affichage
après installation (borné à 4 s). Admin connecté: `?hino_carrousel_refresh=1`
force une relecture.

Le rendu (bande 380 px, cartes 260 px, Oswald, rouge `#ed1c24`, flèches
desktop, scroll-snap tactile) reprend `app/vehicule/carrousel`. Un changement
de règle d'affichage (titre, prix) se fait dans `lib/catalog/carousel-json.ts`:
le PHP imprime des chaînes, il ne formate rien.

### Ancienne méthode (iframe), pour référence


Bande des 8 camions les plus récents, à coller sous « des camions pour tous vos
besoins », dans un bloc **HTML personnalisé**:

```html
<iframe
  src="https://feeds.hinochicoutimi.com/vehicule/carrousel"
  title="Camions en stock — Centre du camion Hino"
  style="width:100%; border:0; display:block; height:380px"
  scrolling="no"
  loading="lazy"
></iframe>
```

**Pas de script ici, et c'est voulu.** La bande a une hauteur constante de 380 px
quel que soit le nombre de camions, donc l'iframe prend la même hauteur en dur:
rien à recalculer, rien qui casse si un script est bloqué. C'est la différence
avec `/vehicule`, dont la hauteur dépend du nombre de cartes.

Ne pas remplacer `height` par une hauteur en pourcentage: une iframe en `%` dans
un conteneur sans hauteur explicite se réduit à zéro et la bande disparaît.

Côté app: `/vehicule/carrousel` a sa **propre** entrée `frame-ancestors` dans
`next.config.ts` — `source` y compare le chemin exact, l'entrée `/vehicule` ne
couvre donc pas le sous-chemin. Le tunnel Cloudflare, lui, l'accepte déjà
(`^/(feeds|_next|vehicule)(/|$)`).

Comportement: une carte s'ouvre en **nouvel onglet** (`_blank`), la tuile « voir
tout l'inventaire » navigue la page **entière** (`_top`) vers
`camion-hino.ca/inventaire` — on ne met pas une page dans une page.

## Quand le sous-domaine arrivera

Voir `docs/superpowers/specs/2026-07-21-inventaire-site-web-design.md`, section
« Phase 2 ». Il faudra changer le `src` de l'iframe et l'origine vérifiée dans
le `if`, ou retirer l'iframe au profit d'un lien de menu vers
`inventaire.camion-hino.ca`.
