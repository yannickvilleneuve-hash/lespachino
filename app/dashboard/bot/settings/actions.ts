"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { currentEditor } from "@/lib/auth/current-editor";
import { botSettingsSchema, type BotSettingsInput } from "@/lib/bot/settings-schema";

export async function saveBotSettings(
  input: BotSettingsInput,
): Promise<{ ok: boolean; message: string }> {
  const parsed = botSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Entrée invalide." };
  }
  const v = parsed.data;
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("bot_setting")
    .update({
      enabled_platforms: v.enabledPlatforms,
      sync_interval_sec: v.syncIntervalSec,
      operator_email: v.operatorEmail,
      max_jobs_per_cycle: v.maxJobsPerCycle,
      pace_min_ms: v.paceMinMs,
      pace_max_ms: v.paceMaxMs,
      updated_by: await currentEditor(),
    })
    .eq("id", 1);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard/bot/settings");
  return { ok: true, message: "Enregistré ✓" };
}
