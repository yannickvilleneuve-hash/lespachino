import { z } from "zod";

export const CHANNELS = [
  "native",
  "wix",
  "fb_marketplace",
  "fb_page",
  "google_vla",
  "lespac",
  "kijiji",
] as const;
export type Channel = (typeof CHANNELS)[number];

export const DEFAULT_CHANNELS: Channel[] = [
  "native",
  "wix",
  "fb_marketplace",
  "fb_page",
  "google_vla",
  "lespac",
];

const LEGACY_CHANNEL_MAP: Record<string, Channel | null> = {
  native: "native",
  fb: "fb_marketplace",
  fb_marketplace: "fb_marketplace",
  fb_page: "fb_page",
  google_vla: "google_vla",
  lespac: "lespac",
  kijiji: "kijiji",
  wix: "wix",
};

export function normalizeChannels(channels: readonly string[] | null | undefined): Channel[] {
  const normalized: Channel[] = [];
  for (const raw of channels ?? []) {
    const mapped = LEGACY_CHANNEL_MAP[raw] ?? null;
    if (mapped && !normalized.includes(mapped)) normalized.push(mapped);
  }
  return normalized.length > 0 ? normalized : [...DEFAULT_CHANNELS];
}

export const listingFormSchema = z.object({
  price_cad: z.number().min(0, "Doit être ≥ 0"),
  description_fr: z.string().trim().max(4000),
  channels: z.array(z.enum(CHANNELS)).min(1, "Au moins un canal"),
});

export type ListingFormInput = z.infer<typeof listingFormSchema>;
