import { NextResponse } from "next/server";

/**
 * Kijiji Autos dealer XML feed — NON IMPLÉMENTÉ.
 *
 * La spec exacte est disponible uniquement via Kijiji Dealer Central
 * (login requis) et leurs Partner Integration docs. Besoin du user:
 *
 * 1. Connexion https://dealercentral.kijiji.ca
 * 2. Section "Feed Integration" / "Flux automatiques"
 * 3. Télécharger la spec XML officielle (Schema XSD + exemple)
 * 4. Transmettre au dev pour implémentation
 *
 * Alternatives vues pendant la recherche:
 * - ADF (Auto Data Format) XML — accepté par certains canaux automotive
 * - Format propriétaire JSON via API (post-onboarding)
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      error: "not_implemented",
      message:
        "Feed Kijiji pas encore implémenté — spec officielle requise via Dealer Central.",
      documentation: "https://dealercentral.kijiji.ca",
      fallback: "/feed/native.json",
    },
    { status: 501 },
  );
}
