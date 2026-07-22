import { createAdminClient } from "@/lib/supabase/admin";

/** Une ligne de `watchdog_check`, telle que l'Edge Function l'écrit. */
export interface WatchdogRow {
  ran_at: string;
  verdict: string;
  detail: string | null;
  feed_status: number | null;
  feed_included: number | null;
  feed_source: string | null;
}

export type WatchdogHealth = "ok" | "alerte" | "muet" | "inconnu";

export interface WatchdogStatus {
  health: WatchdogHealth;
  verdict: string | null;
  detail: string | null;
  ageSec: number | null;
  ranAt: string | null;
}

/**
 * Deux passages manqués. Le chien de garde tourne aux 15 minutes; au-delà de 35,
 * c'est lui qui est en panne.
 */
export const WATCHDOG_SILENT_SEC = 2100;

/**
 * PURE: l'état du chien de garde lui-même.
 *
 * `muet` existe parce qu'un surveillant arrêté ne doit pas se lire comme un
 * pipeline en bonne santé: sans cette distinction, on remplace une panne
 * silencieuse par une autre, avec en prime une tuile verte qui ment.
 */
export function watchdogHealth(row: WatchdogRow | null, now: Date): WatchdogStatus {
  if (!row) {
    return { health: "inconnu", verdict: null, detail: null, ageSec: null, ranAt: null };
  }
  const ms = Date.parse(row.ran_at);
  const ageSec = Number.isFinite(ms) ? Math.max(0, Math.round((now.getTime() - ms) / 1000)) : null;
  const base = { verdict: row.verdict, detail: row.detail, ageSec, ranAt: row.ran_at };

  if (ageSec === null) return { ...base, health: "inconnu" };
  if (ageSec > WATCHDOG_SILENT_SEC) return { ...base, health: "muet" };
  return { ...base, health: row.verdict === "OK" ? "ok" : "alerte" };
}

/** Ne lance jamais: une tuile qui fait tomber le tableau de bord ne surveille rien. */
export async function getWatchdogStatus(now: Date = new Date()): Promise<WatchdogStatus> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("watchdog_check")
      .select("ran_at, verdict, detail, feed_status, feed_included, feed_source")
      .order("ran_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return watchdogHealth(null, now);
    return watchdogHealth((data as WatchdogRow | null) ?? null, now);
  } catch {
    return watchdogHealth(null, now);
  }
}
