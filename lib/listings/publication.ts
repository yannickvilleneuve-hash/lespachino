export interface PublicationCandidate {
  price_cad: number;
  description_fr: string;
  photos: { is_hero: boolean }[];
}

export type PublicationError =
  | "price_missing"
  | "description_missing"
  | "no_photos"
  | "no_hero";

export function validatePublication(l: PublicationCandidate): PublicationError | null {
  if (!(l.price_cad > 0)) return "price_missing";
  if (l.description_fr.trim().length === 0) return "description_missing";
  if (l.photos.length === 0) return "no_photos";
  if (!l.photos.some((p) => p.is_hero)) return "no_hero";
  return null;
}
