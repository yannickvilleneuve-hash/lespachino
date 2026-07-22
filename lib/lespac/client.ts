import { getLespacConfig } from "./config";
import type { LespacListing, LespacListingSummary } from "./types";

/**
 * LesPAC, en LECTURE SEULE — et c'est structurel, pas une convention.
 *
 * La méthode HTTP est écrite en dur ici: ce module ne peut pas émettre autre
 * chose qu'un GET. Ajouter une écriture demande de rouvrir volontairement cette
 * porte, pas d'appeler une fonction qui traînait.
 *
 * Pourquoi c'est verrouillé: LesPAC est la source #1 de l'inventaire, saisie à
 * la main par le concessionnaire. Une ancienne version de pacman y poussait des
 * annonces composées depuis un export externe, et elle y a laissé quatre
 * annonces au modèle tronqué (« TRANSIT T- ») et au lien vendeur mort. Le
 * miroir ne réécrit pas sa source.
 */
async function lespacGet<T>(path: string): Promise<T> {
  const { token, baseUrl } = getLespacConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      Authorization: `LPC token="${token}"`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Lespac GET ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }

  const ct = res.headers.get("content-type") ?? "";
  if (res.status === 204 || !ct.includes("json")) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/** Détail complet d'une annonce par listingId Lespac. */
export function getByListingId(listingId: number): Promise<LespacListing | null> {
  return lespacGet<LespacListing | null>(`/sell-api/v1.0/listings/${listingId}`).catch((err) => {
    if (err instanceof Error && /→ 404:/.test(err.message)) return null;
    throw err;
  });
}

/** Détail d'une annonce par notre identifiant (vendorId = unit#), quand elle en
 *  a un: seules les annonces créées par l'ancienne version en portent. */
export function getByVendorId(vendorId: string): Promise<LespacListing | null> {
  return lespacGet<LespacListing | null>(
    `/sell-api/v1.0/listings/vendorId/${encodeURIComponent(vendorId)}`,
  ).catch((err) => {
    if (err instanceof Error && /→ 404:/.test(err.message)) return null;
    throw err;
  });
}

export async function listAll(): Promise<LespacListingSummary[]> {
  const res = await lespacGet<{ listingSummary: LespacListingSummary }[] | LespacListingSummary[]>(
    "/sell-api/v1.0/listings",
  );
  // L'API retourne parfois des entrées avec un wrapper `listingSummary`.
  return (res ?? []).map((r) =>
    (r as { listingSummary: LespacListingSummary }).listingSummary ?? (r as LespacListingSummary),
  );
}
