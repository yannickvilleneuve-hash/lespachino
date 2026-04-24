# Embed du catalogue sur camion-hino.ca (Wix)

## URL à utiliser

```
https://hino1-thinkcentre-m93p.tail0e1ea8.ts.net:8443/embed/catalog
```

Version allégée (pas de header admin) du catalogue `/`, optimisée pour
l'iframe. Les clics sur une ligne ouvrent la fiche véhicule en **nouvel
onglet** — évite la navigation enfermée dans l'iframe.

Le header `Content-Security-Policy: frame-ancestors` autorise l'embed
depuis n'importe quel sous-domaine `wix.com`, `wixsite.com`, `editorx.io`,
plus `camion-hino.ca` lui-même.

## Steps côté Wix

1. Login https://www.wix.com → **Edit Site** du site `camion-hino.ca`
2. Add → **Embed** → **Embed a Site** (ou "Embed HTML" → iframe)
3. URL: `https://hino1-thinkcentre-m93p.tail0e1ea8.ts.net:8443/embed/catalog`
4. Dimensionne le widget:
   - Width: 100% du conteneur (Wix appelle ça "Stretch")
   - Height: au moins **800px** pour afficher 8-10 lignes sans scroll interne
   - Option: mettre un `min-height` CSS
5. Publish la page

**Page Wix recommandée**: crée une nouvelle page **Inventaire** dans le menu,
insère le widget plein écran, publie. Visite
`https://www.camion-hino.ca/inventaire` pour voir.

## Ce qui s'affiche dans l'iframe

- Barre du haut avec nombre de véhicules disponibles
- Liste compacte: photo 110×82, titre année/make/model, specs
  (catégorie/km/couleur), description courte, prix rouge
- Click sur une ligne → ouvre la fiche détail en nouvel onglet

## Limites connues

- **Hauteur fixe**: l'iframe ne s'auto-resize pas. Si la liste grandit,
  choisis une hauteur confortable ou ajoute `scrolling="auto"` dans l'embed.
- **Port 8443 dans l'URL**: pas joli, mais nécessaire tant que le Funnel
  Tailscale reste sur ce port. Quand le DNS `camion-hino.ca` sera
  configurable, on pointera `catalog.camion-hino.ca` → notre app,
  l'URL d'embed deviendra `https://catalog.camion-hino.ca/embed/catalog`.
- **SEO**: la page `/embed/catalog` est `noindex` — Google ne l'indexera
  pas directement (mais il peut indexer via la page Wix qui l'embed).
  Le catalogue principal `/` reste indexable.

## Alternative: iframe HTML pur

Si Wix "Embed a Site" ne donne pas assez de contrôle, utilise **Embed HTML**
avec ce code:

```html
<iframe
  src="https://hino1-thinkcentre-m93p.tail0e1ea8.ts.net:8443/embed/catalog"
  width="100%"
  height="800"
  frameborder="0"
  scrolling="auto"
  title="Inventaire Centre du camion Hino"
  style="border:none; max-width:100%;">
</iframe>
```
