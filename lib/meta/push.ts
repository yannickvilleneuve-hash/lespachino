/**
 * Meta Commerce Manager — push instant via Graph API.
 *
 * 2 modes possibles selon env:
 * 1. META_FEED_ID + META_ACCESS_TOKEN → force pull du feed CSV (re-fetch immédiat)
 * 2. (futur) META_CATALOG_ID + META_ACCESS_TOKEN → POST direct item par item
 *
 * Pour mode 1, le feed config dans Meta Commerce Manager pointe déjà vers
 * `feeds.hinochicoutimi.com/feed/facebook.csv` — ce trigger force Meta à
 * re-télécharger le CSV maintenant au lieu d'attendre le pull horaire.
 */

const GRAPH_API = "https://graph.facebook.com/v21.0";

export type MetaPushResult =
  | { action: "skipped"; reason: string }
  | { action: "triggered"; uploadId?: string }
  | { action: "error"; error: string };

export async function triggerMetaFeedRefresh(): Promise<MetaPushResult> {
  const token = process.env.META_ACCESS_TOKEN;
  const feedId = process.env.META_FEED_ID;
  if (!token || !feedId) {
    return { action: "skipped", reason: "META_ACCESS_TOKEN ou META_FEED_ID absent" };
  }
  try {
    const resp = await fetch(`${GRAPH_API}/${feedId}/uploads`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    const body = await resp.text();
    if (!resp.ok) {
      return { action: "error", error: `${resp.status}: ${body.slice(0, 200)}` };
    }
    let uploadId: string | undefined;
    try {
      uploadId = JSON.parse(body).id as string | undefined;
    } catch {
      // ignore parse fail
    }
    return { action: "triggered", uploadId };
  } catch (err) {
    return { action: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

export function isMetaPushReady(): boolean {
  return Boolean(process.env.META_ACCESS_TOKEN && process.env.META_FEED_ID);
}
