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

Le `min-height` couvre le cas où le script ne s'exécute pas (bloqueur, cache
agressif): l'inventaire reste lisible, seulement moins haut.

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
