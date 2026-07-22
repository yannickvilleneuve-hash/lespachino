/**
 * Le plancher du feed.
 *
 * Pourquoi ce module existe: `serveFeed()` bâtit le feed depuis un appel LIVE à
 * LesPAC. Si l'API répond 200 avec une liste vide ou tronquée — jeton révoqué,
 * compte suspendu, panne partielle — nous servirions 0 ou 3 véhicules en HTTP
 * 200. Meta ne verrait aucune erreur: il viderait le catalogue, et les
 * publicités s'arrêteraient sans un seul signal. **Un 500 franc est moins
 * dangereux qu'un 200 amaigri.**
 *
 * D'où la règle: on ne publie jamais un effondrement. On sert le snapshot (au
 * plus 15 minutes de retard, des camions réels), et si lui aussi est vide, on
 * refuse — Meta garde alors sa dernière copie valide.
 */

/** Sous cette part du snapshot, le live est considéré comme effondré. */
export const FLOOR_RATIO = 0.8;

/** En dessous, il n'y a plus de feed à servir du tout. */
export const MIN_ABSOLUTE = 1;

export type FeedSource = "live" | "snapshot" | "refuse";

/**
 * PURE: quelle source servir, à partir des deux compteurs d'éligibles.
 *
 * `snapshot` à 0 n'est pas un veto: une base fraîchement réinitialisée ne doit
 * pas faire taire un live parfaitement sain.
 */
export function chooseFeedSource(live: number, snapshot: number): FeedSource {
  const liveCount = Number.isFinite(live) ? Math.max(0, live) : 0;
  const snapCount = Number.isFinite(snapshot) ? Math.max(0, snapshot) : 0;

  if (liveCount >= MIN_ABSOLUTE && liveCount >= Math.ceil(FLOOR_RATIO * snapCount)) {
    return "live";
  }
  if (snapCount >= MIN_ABSOLUTE) return "snapshot";
  return "refuse";
}
