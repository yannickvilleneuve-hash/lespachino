/**
 * Meta Page Posts — publication automatique sur la Page FB Centre du Camion Hino.
 *
 * Pré-requis (côté Meta):
 * 1. App `pacman-marketplace` a use case "Manage everything on your Page" ajouté.
 * 2. Permissions `pages_read_engagement` + `pages_manage_posts` activées sur l'app.
 * 3. System User `pacman` a la Page assignée avec permission Contenu.
 * 4. Token regénéré avec scopes `pages_read_engagement` + `pages_manage_posts`.
 *
 * Flow:
 * - Get Page Access Token via /{page_id}?fields=access_token avec system user token.
 * - POST /{page_id}/photos avec url=hero + caption + link.
 *
 * Si permissions manquantes côté token, retourne `skipped` — pas d'erreur fatale.
 */

const GRAPH_API = "https://graph.facebook.com/v21.0";

export type PagePostResult =
  | { action: "skipped"; reason: string }
  | { action: "posted"; postId: string }
  | { action: "error"; error: string };

export interface VehiclePostPayload {
  unit: string;
  year: number;
  make: string;
  model: string;
  category: string;
  km: number;
  price_cad: number;
  hero_url: string | null;
  description_fr: string;
  detail_url: string;
}

function buildCaption(v: VehiclePostPayload): string {
  const title = `${v.year} ${v.make} ${v.model}`.trim();
  const priceFmt = new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(v.price_cad);
  const lines = [`🚛 ${title} — ${priceFmt}`, "", v.category];
  if (v.km > 0) lines.push(`${v.km.toLocaleString("fr-CA")} km`);
  if (v.description_fr) lines.push("", v.description_fr);
  lines.push("", "👉 " + v.detail_url);
  return lines.join("\n");
}

async function getPageAccessToken(): Promise<string | null> {
  const token = process.env.META_ACCESS_TOKEN;
  const pageId = process.env.META_PAGE_ID;
  if (!token || !pageId) return null;
  const resp = await fetch(
    `${GRAPH_API}/${pageId}?fields=access_token&access_token=${encodeURIComponent(token)}`,
  );
  if (!resp.ok) return null;
  const body = (await resp.json()) as { access_token?: string };
  return body.access_token ?? null;
}

export async function postVehicleToPage(v: VehiclePostPayload): Promise<PagePostResult> {
  const pageId = process.env.META_PAGE_ID;
  if (!pageId) return { action: "skipped", reason: "META_PAGE_ID absent" };
  if (!process.env.META_ACCESS_TOKEN) {
    return { action: "skipped", reason: "META_ACCESS_TOKEN absent" };
  }
  if (!v.hero_url) return { action: "skipped", reason: "véhicule sans photo" };

  let pageToken: string | null;
  try {
    pageToken = await getPageAccessToken();
  } catch (err) {
    return { action: "error", error: `getPageAccessToken: ${(err as Error).message}` };
  }
  if (!pageToken) {
    return { action: "skipped", reason: "Page Access Token indisponible (permissions manquantes)" };
  }

  const params = new URLSearchParams({
    url: v.hero_url,
    caption: buildCaption(v),
    access_token: pageToken,
  });

  try {
    const resp = await fetch(`${GRAPH_API}/${pageId}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const body = await resp.text();
    if (!resp.ok) {
      return { action: "error", error: `${resp.status}: ${body.slice(0, 300)}` };
    }
    let postId: string | undefined;
    try {
      postId = (JSON.parse(body) as { post_id?: string; id?: string }).post_id ??
        (JSON.parse(body) as { id?: string }).id;
    } catch {
      // ignore parse fail
    }
    return { action: "posted", postId: postId ?? "unknown" };
  } catch (err) {
    return { action: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

export function isPagePostReady(): boolean {
  return Boolean(process.env.META_ACCESS_TOKEN && process.env.META_PAGE_ID);
}
