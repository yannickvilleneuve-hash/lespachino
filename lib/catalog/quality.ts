import type { SnapshotVehicle } from "@/lib/catalog/read";
import type { CatalogVehicle } from "@/lib/catalog/types";

/**
 * Détecte un modèle arrivé coupé de LesPAC.
 *
 * Pourquoi ça existe: le catalogue est un miroir, pacman ne corrige pas sa
 * source. Quand une annonce dit « TRANSIT T- », la carte publique dit
 * « TRANSIT T- », et la seule réparation possible est humaine, sur LesPAC. Reste
 * à ce que personne ne l'apprenne par un client au téléphone: ce module rend le
 * défaut visible sur le tableau de bord.
 *
 * Deux signatures, complémentaires:
 *
 * 1. Le modèle **pend sur un séparateur** (« TRANSIT T- »). Sans ambiguïté.
 * 2. **Titre de 20 caractères pile ET modèle de 10 pile.** C'est l'empreinte
 *    d'un champ à longueur fixe: « ANNÉE MARQUE MODÈLE » = 4+1+4+1+10. Elle
 *    attrape « F750 SUPER » (pour « F750 SUPER DUTY »), qui ne pend sur rien.
 *    Les deux indices sont exigés ensemble: la longueur seule condamnerait des
 *    titres parfaitement écrits.
 */
const DANGLING = /[-–—/,;:]$/;
const FIXED_FIELD_TITLE_LEN = 20;
const FIXED_FIELD_MODEL_LEN = 10;

export interface TruncatedModel {
  /** listingId LesPAC — c'est l'annonce à corriger. */
  id: string;
  title: string;
  model: string;
  reason: string;
}

/** PURE: la raison de soupçonner une troncature, ou null si le modèle va bien. */
export function truncationReason(v: CatalogVehicle): string | null {
  const model = v.model.trim();
  if (!model) return null;

  if (DANGLING.test(model)) return "modèle coupé net sur un séparateur";

  if (v.title.trim().length === FIXED_FIELD_TITLE_LEN && model.length === FIXED_FIELD_MODEL_LEN) {
    return "titre et modèle pile aux longueurs d'un champ à longueur fixe";
  }

  return null;
}

/** PURE: les véhicules dont le modèle semble amputé, avec de quoi les retrouver. */
export function findTruncatedModels(rows: SnapshotVehicle[]): TruncatedModel[] {
  const out: TruncatedModel[] = [];
  for (const { vehicle } of rows) {
    const reason = truncationReason(vehicle);
    if (reason) {
      out.push({ id: vehicle.id, title: vehicle.title, model: vehicle.model, reason });
    }
  }
  return out;
}
