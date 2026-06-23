import { z } from "zod";
import { ALL_PLATFORMS } from "@/lib/bot/config";

export const SYNC_INTERVAL_CHOICES = [
  { value: 3600, label: "Aux heures" },
  { value: 10800, label: "Aux 3 heures" },
  { value: 43200, label: "2× par jour" },
  { value: 86400, label: "1× par jour" },
] as const;

export const PACE_CHOICES = [
  { value: "prudent", minMs: 8000, maxMs: 20000, label: "Prudent" },
  { value: "normal", minMs: 4000, maxMs: 12000, label: "Normal" },
] as const;

export const botSettingsSchema = z.object({
  enabledPlatforms: z
    .array(z.enum(ALL_PLATFORMS as unknown as [string, ...string[]]))
    .min(1, "Au moins une plateforme."),
  syncIntervalSec: z.number().int().min(300),
  operatorEmail: z.union([z.string().email(), z.literal("")]),
  maxJobsPerCycle: z.number().int().min(1).max(100),
  paceMinMs: z.number().int().min(0),
  paceMaxMs: z.number().int().min(0),
}).refine((v) => v.paceMaxMs >= v.paceMinMs, {
  message: "Le rythme max doit être ≥ au min.",
  path: ["paceMaxMs"],
});

export type BotSettingsInput = z.infer<typeof botSettingsSchema>;
