import { judge, decideAlert, describe, type FeedObservation, type SyncObservation } from "./verdict.ts";

/**
 * Chien de garde du pipeline, hébergé PAR SUPABASE et non par la machine
 * surveillée. C'est tout l'intérêt: quand le serveur ou le tunnel meurent, c'est
 * exactement le moment où un chien de garde local se tairait.
 *
 * Il regarde deux choses, écrit ce qu'il voit dans `watchdog_check`, et n'écrit
 * un courriel que si la panne se confirme.
 *
 * `verify_jwt` est désactivé pour que `pg_cron` puisse l'appeler sans stocker de
 * clé en clair dans la table des tâches. Déclencher une vérification depuis
 * l'extérieur ne révèle rien et ne change rien; les courriels, eux, restent
 * bornés par la règle des deux verdicts rouges consécutifs puis un par 24 h.
 */

const FEED_URL = Deno.env.get("WATCHDOG_FEED_URL") ?? "https://feeds.hinochicoutimi.com/feeds/meta.csv";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const GRAPH_TENANT = Deno.env.get("GRAPH_TENANT_ID");
const GRAPH_CLIENT = Deno.env.get("GRAPH_CLIENT_ID");
const GRAPH_SECRET = Deno.env.get("GRAPH_CLIENT_SECRET");
const GRAPH_FROM = Deno.env.get("GRAPH_FROM");
const ALERT_TO = Deno.env.get("WATCHDOG_ALERT_TO");

const rest = (path: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

/** Le feed vu de l'extérieur, exactement comme Meta le voit. */
async function observeFeed(): Promise<FeedObservation> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25_000);
    const r = await fetch(FEED_URL, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    await r.body?.cancel();
    const n = (h: string) => {
      const v = r.headers.get(h);
      return v === null ? null : Number.parseInt(v, 10);
    };
    return { status: r.status, included: n("x-feed-included"), source: r.headers.get("x-feed-source") };
  } catch {
    // Pas de réponse du tout: tunnel coupé, machine morte, DNS cassé.
    return { status: null, included: null, source: null };
  }
}

async function observeSync(): Promise<SyncObservation> {
  try {
    const r = await rest("catalog_sync?id=eq.1&select=ran_at,ok");
    const [row] = (await r.json()) as { ran_at: string; ok: boolean }[];
    if (!row) return { ageSec: null, ok: null };
    const age = Math.round((Date.now() - Date.parse(row.ran_at)) / 1000);
    return { ageSec: Number.isFinite(age) ? age : null, ok: row.ok };
  } catch {
    return { ageSec: null, ok: null };
  }
}

interface LastCheck { verdict: string; consecutive_red: number; alerted_at: string | null }

async function lastCheck(): Promise<LastCheck | null> {
  try {
    const r = await rest("watchdog_check?select=verdict,consecutive_red,alerted_at&order=ran_at.desc&limit=1");
    const [row] = (await r.json()) as LastCheck[];
    return row ?? null;
  } catch {
    return null;
  }
}

async function sendMail(subject: string, body: string): Promise<boolean> {
  if (!GRAPH_TENANT || !GRAPH_CLIENT || !GRAPH_SECRET || !GRAPH_FROM || !ALERT_TO) {
    console.error("[watchdog] secrets Graph absents — vérification enregistrée, courriel impossible");
    return false;
  }
  const tok = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GRAPH_CLIENT,
      client_secret: GRAPH_SECRET,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!tok.ok) { console.error("[watchdog] jeton Graph refusé:", tok.status); return false; }
  const { access_token } = await tok.json();

  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${GRAPH_FROM}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "Text", content: body },
        toRecipients: [{ emailAddress: { address: ALERT_TO } }],
      },
      saveToSentItems: false,
    }),
  });
  if (!r.ok) console.error("[watchdog] envoi Graph refusé:", r.status, await r.text());
  return r.ok;
}

Deno.serve(async () => {
  const [feed, sync, prev] = await Promise.all([observeFeed(), observeSync(), lastCheck()]);
  const verdict = judge(feed, sync);
  const red = verdict !== "OK";
  const prevRed = prev !== null && prev.verdict !== "OK";
  const consecutive = red ? (prevRed ? prev!.consecutive_red + 1 : 1) : 0;
  const sinceLastAlertSec = prev?.alerted_at ? Math.round((Date.now() - Date.parse(prev.alerted_at)) / 1000) : null;

  const decision = decideAlert(verdict, { consecutiveRed: consecutive, sinceLastAlertSec, previousWasRed: prevRed });
  const detail = describe(verdict, feed, sync);

  let alerted = false;
  if (decision !== "silence") {
    const sujet = decision === "recovery"
      ? "pacman — rétabli"
      : `pacman — ${verdict}${decision === "reminder" ? " (toujours en panne)" : ""}`;
    const corps = [
      detail,
      "",
      `Feed        : statut ${feed.status ?? "aucune réponse"}, ${feed.included ?? "?"} véhicules, source ${feed.source ?? "?"}`,
      `Worker      : ${sync.ok === null ? "illisible" : sync.ok ? "ok" : "en échec"}, dernière passe il y a ${sync.ageSec ?? "?"} s`,
      `Vérifié     : ${new Date().toISOString()}`,
      `Feed surveillé : ${FEED_URL}`,
    ].join("\n");
    alerted = await sendMail(sujet, corps);
  }

  // L'enregistrement passe même si le courriel échoue: la tuile du tableau de
  // bord reste alors le dernier filet.
  await rest("watchdog_check", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      verdict,
      feed_status: feed.status,
      feed_included: feed.included,
      feed_source: feed.source,
      sync_age_sec: sync.ageSec,
      sync_ok: sync.ok,
      consecutive_red: consecutive,
      detail,
      alerted_at: alerted ? new Date().toISOString() : (prev?.alerted_at ?? null),
    }),
  });

  return new Response(JSON.stringify({ verdict, decision, alerted, feed, sync }), {
    headers: { "Content-Type": "application/json" },
  });
});
