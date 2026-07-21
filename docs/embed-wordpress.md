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

## Quand le sous-domaine arrivera

Voir `docs/superpowers/specs/2026-07-21-inventaire-site-web-design.md`, section
« Phase 2 ». Il faudra changer le `src` de l'iframe et l'origine vérifiée dans
le `if`, ou retirer l'iframe au profit d'un lien de menu vers
`inventaire.camion-hino.ca`.
