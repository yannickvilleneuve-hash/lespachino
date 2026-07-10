/** Types dérivés de la doc technique Lespac publique
 *  https://www.lespac.com/public/listing/import/technical-documentation */

export type LespacState = "NEW" | "USED" | "N/A";
/** `EXPIRED` is undocumented but returned in practice (2 of 27 listings, 2026-07-10). */
export type LespacStatus = "ONLINE" | "PENDING" | "DEACTIVATED" | "EXPIRED";
export type LespacContactType = "STANDARD" | "COURTIER";

/** Clés en français, valeurs typées string (JSON dict).
 *  Pour catégorie Véhicules - Camions: champs obligatoires = Type de camion,
 *  Marque, Kilométrage. */
export type LespacAttributes = Record<string, string>;

export interface LespacContact {
  type: LespacContactType;
  emailAddress: string;
  firstName: string;
  lastName: string;
  phone1?: string | null;
  phoneNote1?: string | null;
  phone2?: string | null;
  phoneNote2?: string | null;
  realEstateAgency?: string | null;
}

export interface LespacListing {
  listingId: number | null;
  /**
   * Our own key, set only on listings pacman upserted through the API.
   * Null on every ad the seller posted by hand — 20 of 25 live listings on
   * 2026-07-10. Never anchor anything public on this.
   */
  vendorId: string | null;
  category: string;
  title: string;
  description?: string | null;
  price?: number | null;
  priceNote?: string | null;
  videoURL?: string | null;
  postalCode: string;
  year?: number | null;
  state?: LespacState | null;
  listingURL?: string | null;
  contact: LespacContact;
  status: LespacStatus;
  imageURLs?: string[];
  buyNowURL?: string | null;
  attributes?: LespacAttributes;
}

export interface LespacListingSummary {
  listingId: number;
  /** Null unless pacman created the listing. See `LespacListing.vendorId`. */
  vendorId: string | null;
  title: string;
  state: LespacState;
  status: LespacStatus;
}

export interface LespacSaveResponse {
  listingSummary: LespacListingSummary;
  errors: unknown[] | null;
}

export interface LespacError {
  code?: string;
  message?: string;
  field?: string;
}
