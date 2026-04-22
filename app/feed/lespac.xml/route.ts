import { NextResponse } from "next/server";

/**
 * Lespac dealer XML feed — NON IMPLÉMENTÉ.
 *
 * Aucune doc publique trouvée. Besoin user: contacter Lespac support dealer
 * (<contact@lespac.com> ou via dashboard dealer) pour obtenir:
 * - Spec XML/CSV officielle
 * - Exemple validé
 * - URL endpoint où le feed doit être hébergé
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      error: "not_implemented",
      message:
        "Feed Lespac pas encore implémenté — spec officielle requise via support dealer Lespac.",
      fallback: "/feed/native.json",
    },
    { status: 501 },
  );
}
