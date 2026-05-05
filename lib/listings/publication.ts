import type { Channel } from "./schema";

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
  | "price_missing"
  | "no_channels";

export const PRICE_REQUIRED_CHANNELS = new Set<Channel>([
  "fb_marketplace",
  "google_vla",
]);

export function channelsRequirePrice(channels: readonly Channel[]): boolean {
  return channels.some((channel) => PRICE_REQUIRED_CHANNELS.has(channel));
}

export function validatePublication(l: PublicationCandidate): PublicationError | null {
  if (l.description_fr.trim().length === 0) return "description_missing";
  if (l.photos.length === 0) return "no_photos";
  if (!l.photos.some((p) => p.is_hero)) return "no_hero";
  if (l.available === false) return "not_available";
  return null;
}

export function validatePublicationForChannels(
  l: PublicationCandidate,
  channels: readonly Channel[],
): PublicationError | null {
  const baseError = validatePublication(l);
  if (baseError) return baseError;
  if (channelsRequirePrice(channels) && !(Number.isFinite(l.price_cad) && l.price_cad > 0)) {
    return "price_missing";
  }
  return null;
}
