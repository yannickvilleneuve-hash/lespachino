import { z } from "zod";

export const CHANNELS = ["native", "fb", "lespac", "kijiji"] as const;
export type Channel = (typeof CHANNELS)[number];

export const listingFormSchema = z.object({
  price_cad: z.coerce.number().min(0, "Doit être ≥ 0"),
  description_fr: z.string().trim().max(4000),
  channels: z.array(z.enum(CHANNELS)).min(1, "Au moins un canal"),
});

export type ListingFormInput = z.infer<typeof listingFormSchema>;
