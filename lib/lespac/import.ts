/**
 * Helpers pour rapatrier les annonces Lespac créées manuellement
 * (vendorId=null) et les rattacher à un véhicule SERTI.
 */

import type { LespacListing, LespacListingSummary } from "./types";
import type { SertiStatus } from "@/lib/serti/wgi";

export interface SertiCandidate {
  unit: string;
  make: string;
  model: string;
  year: number;
  km: number;
  status: SertiStatus;
}

export interface MatchScore {
  unit: string;
  score: number;
  reasons: string[];
}

/** Normalise pour comparer "L8" / "l 8" / "L-8" — minuscule sans espace/tiret. */
function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[\s\-_.]+/g, "");
}

/** Donne un classement (score décroissant) des SERTI units candidats pour
 *  un détail Lespac. Score = make match (50) + model match (30) +
 *  year exact (15) + km dans ±10 % (10) + km dans ±25 % (5). */
export function rankSertiMatches(
  detail: Pick<LespacListing, "year" | "attributes">,
  candidates: SertiCandidate[],
): MatchScore[] {
  const a = detail.attributes ?? {};
  const lpcMake = norm(a["Marque"]);
  const lpcModel = norm(a["Modèle"]);
  const lpcYear = detail.year ?? 0;
  const lpcKm = parseInt(a["Kilométrage"] ?? "0", 10) || 0;

  const scored: MatchScore[] = [];
  for (const c of candidates) {
    let score = 0;
    const reasons: string[] = [];
    if (lpcMake && norm(c.make) === lpcMake) {
      score += 50;
      reasons.push("marque");
    }
    if (lpcModel && norm(c.model) === lpcModel) {
      score += 30;
      reasons.push("modèle");
    }
    if (lpcYear > 0 && c.year === lpcYear) {
      score += 15;
      reasons.push("année");
    }
    if (lpcKm > 0 && c.km > 0) {
      const delta = Math.abs(c.km - lpcKm) / Math.max(c.km, lpcKm);
      if (delta <= 0.1) {
        score += 10;
        reasons.push("km ±10%");
      } else if (delta <= 0.25) {
        score += 5;
        reasons.push("km ±25%");
      }
    }
    if (score > 0) scored.push({ unit: c.unit, score, reasons });
  }
  return scored.sort((a, b) => b.score - a.score);
}

export function isManual(s: LespacListingSummary): boolean {
  return s.vendorId === null || s.vendorId === "";
}
