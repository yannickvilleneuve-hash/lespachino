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

## Le carrousel de l'accueil (page 59)

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
