/**
 * PURE: transformer deux observations en un verdict, et décider s'il faut
 * déranger un humain.
 *
 * Vit hors de la machine surveillée (Edge Function Supabase): un chien de garde
 * hébergé par ce qu'il surveille se tait précisément quand tout brûle.
 */

export type Verdict =
  | "OK"
  | "FEED_DOWN"
  | "FEED_THIN"
  | "FEED_DEGRADED"
  | "SYNC_STALE"
  | "SYNC_FAILING"
  | "UNKNOWN";

export interface FeedObservation {
  /** null quand la requête n'a même pas abouti. */
  status: number | null;
  included: number | null;
  source: string | null;
}

export interface SyncObservation {
  ageSec: number | null;
  ok: boolean | null;
}

/** Trois cycles de worker manqués. Aligné sur STALE_CYCLES côté app. */
export const SYNC_STALE_SEC = 2700;

/** En dessous, le feed n'a plus rien à annoncer et Meta viderait sa vitrine. */
export const FEED_MIN_ITEMS = 1;

/** Un verdict rouge doit se répéter avant de réveiller quelqu'un. */
export const CONSECUTIVE_BEFORE_ALERT = 2;

/** Une seule relance par jour tant que la panne dure. */
export const REMINDER_SEC = 86400;

/**
 * Ordre délibéré: ce qui est visible du public passe avant ce qui est interne.
 * Un feed mort coûte des publicités tout de suite; un worker en retard coûte de
 * la fraîcheur.
 */
export function judge(feed: FeedObservation, sync: SyncObservation): Verdict {
  if (feed.status === null) return "FEED_DOWN";
  if (feed.status !== 200) return "FEED_DOWN";
  if (feed.included !== null && feed.included < FEED_MIN_ITEMS) return "FEED_THIN";
  if (sync.ok === false) return "SYNC_FAILING";
  if (sync.ageSec !== null && sync.ageSec > SYNC_STALE_SEC) return "SYNC_STALE";
  // Le feed répond et sert de vrais camions, mais depuis le snapshot: LesPAC est
  // probablement en panne. Pas une urgence — le blindage fait son travail — mais
  // il faut le savoir avant que le snapshot vieillisse.
  if (feed.source === "snapshot") return "FEED_DEGRADED";
  if (sync.ageSec === null) return "UNKNOWN";
  return "OK";
}

export function isRed(v: Verdict): boolean {
  return v !== "OK";
}

export interface AlertState {
  /** Nombre de verdicts rouges consécutifs, celui-ci inclus. */
  consecutiveRed: number;
  /** Secondes depuis la dernière alerte envoyée, null si jamais. */
  sinceLastAlertSec: number | null;
  /** Le verdict précédent était-il rouge? Sert au message de rétablissement. */
  previousWasRed: boolean;
}

export type AlertDecision = "silence" | "alert" | "reminder" | "recovery";

/**
 * PURE: faut-il écrire, et à quel titre?
 *
 * Le silence est le comportement par défaut: une alerte qui arrive toutes les
 * 15 minutes cesse d'être lue au bout d'une heure, et c'est précisément ce jour-là
 * que la panne suivante passera inaperçue.
 */
export function decideAlert(verdict: Verdict, state: AlertState): AlertDecision {
  if (!isRed(verdict)) return state.previousWasRed ? "recovery" : "silence";
  if (state.consecutiveRed < CONSECUTIVE_BEFORE_ALERT) return "silence";
  if (state.sinceLastAlertSec === null) return "alert";
  return state.sinceLastAlertSec >= REMINDER_SEC ? "reminder" : "silence";
}

/** Ce que l'humain lit dans sa boîte: quoi, où, depuis quand. */
export function describe(verdict: Verdict, feed: FeedObservation, sync: SyncObservation): string {
  const parts: Record<Verdict, string> = {
    OK: "Tout va bien.",
    FEED_DOWN: `Le feed Meta ne répond pas (statut ${feed.status ?? "aucune réponse"}). Meta garde sa dernière copie, mais les nouveaux camions n'y entrent plus.`,
    FEED_THIN: `Le feed ne contient que ${feed.included} véhicule(s). Servir ça viderait le catalogue Meta.`,
    FEED_DEGRADED: `Le feed est servi depuis le snapshot: LesPAC ne répond plus correctement. Les publicités tournent sur l'inventaire enregistré, qui vieillit.`,
    SYNC_STALE: `Aucune synchronisation réussie depuis ${Math.round((sync.ageSec ?? 0) / 60)} minutes. Le site affiche un inventaire figé.`,
    SYNC_FAILING: `Le worker tourne mais échoue à chaque passage.`,
    UNKNOWN: `État indéterminé: la table de synchronisation est illisible. Ce n'est pas un feu vert.`,
  };
  return parts[verdict];
}
