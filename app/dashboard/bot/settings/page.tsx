import AppHeader from "@/app/app-header";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadBotConfig } from "@/lib/bot/config";
import { PACE_CHOICES, type BotSettingsInput } from "@/lib/bot/settings-schema";
import SettingsForm from "./settings-form";

export const dynamic = "force-dynamic";

/** Derive the pace choice that best matches the stored min/max, then return min/max. */
function mapPace(minMs: number, maxMs: number): { paceMinMs: number; paceMaxMs: number } {
  for (const c of PACE_CHOICES) {
    if (c.minMs === minMs && c.maxMs === maxMs) return { paceMinMs: c.minMs, paceMaxMs: c.maxMs };
  }
  // No exact match — round to closest choice
  const closest = PACE_CHOICES.reduce((best, c) => {
    const dBest = Math.abs(best.minMs - minMs) + Math.abs(best.maxMs - maxMs);
    const dC = Math.abs(c.minMs - minMs) + Math.abs(c.maxMs - maxMs);
    return dC < dBest ? c : best;
  });
  return { paceMinMs: closest.minMs, paceMaxMs: closest.maxMs };
}

export default async function BotSettingsPage() {
  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("bot_setting")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  const base = loadBotConfig();

  const initial: BotSettingsInput = row
    ? {
        enabledPlatforms: row.enabled_platforms ?? base.enabledPlatforms,
        syncIntervalSec: row.sync_interval_sec ?? base.syncIntervalSec,
        operatorEmail: row.operator_email ?? base.operatorEmail,
        maxJobsPerCycle: row.max_jobs_per_cycle ?? base.maxJobsPerCycle,
        ...mapPace(
          row.pace_min_ms ?? base.paceMinMs,
          row.pace_max_ms ?? base.paceMaxMs,
        ),
      }
    : {
        enabledPlatforms: base.enabledPlatforms,
        syncIntervalSec: base.syncIntervalSec,
        operatorEmail: base.operatorEmail,
        maxJobsPerCycle: base.maxJobsPerCycle,
        paceMinMs: base.paceMinMs,
        paceMaxMs: base.paceMaxMs,
      };

  const updatedBy = row?.updated_by ?? null;
  const updatedAt = row?.updated_at
    ? new Intl.DateTimeFormat("fr-CA", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(row.updated_at))
    : null;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <AppHeader
        title="Réglages du bot"
        right={
          <Link
            href="/dashboard/bot"
            className="text-xs text-white/70 hover:text-white"
          >
            ← Bot LesPAC
          </Link>
        }
      />

      <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-950">
            Réglages du bot
          </h2>
          <SettingsForm initial={initial} />
        </section>

        {(updatedBy || updatedAt) && (
          <p className="px-1 text-xs text-slate-400">
            Dernière modif :{" "}
            {updatedBy && <span>{updatedBy}</span>}
            {updatedBy && updatedAt && " · "}
            {updatedAt && <span>{updatedAt}</span>}
          </p>
        )}
      </div>
    </main>
  );
}
