export interface PublicationCandidate {
  price_cad: number;
  description_fr: string;
  photos: { is_hero: boolean }[];
  available?: boolean;
}

export type PublicationError =
  | "description_missing"
  | "no_photos"
  | "no_hero"
  | "not_available"
  | "no_channels";

export function validatePublication(l: PublicationCandidate): PublicationError | null {
  if (l.description_fr.trim().length === 0) return "description_missing";
  if (l.photos.length === 0) return "no_photos";
  if (!l.photos.some((p) => p.is_hero)) return "no_hero";
  if (l.available === false) return "not_available";
  return null;
}
