"use client";

import { useState, useTransition } from "react";
import {
  SYNC_INTERVAL_CHOICES,
  PACE_CHOICES,
  type BotSettingsInput,
} from "@/lib/bot/settings-schema";
import { ALL_PLATFORMS } from "@/lib/bot/config";
import { saveBotSettings } from "./actions";

/** Derive the PACE_CHOICES key from the stored min/max values. */
function derivePace(minMs: number, maxMs: number): string {
  for (const c of PACE_CHOICES) {
    if (c.minMs === minMs && c.maxMs === maxMs) return c.value;
  }
  return PACE_CHOICES[0].value;
}

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  kijiji: "Kijiji",
  autotrader: "AutoTrader",
};

const COMING_SOON = new Set(["kijiji", "autotrader"]);

export default function SettingsForm({ initial }: { initial: BotSettingsInput }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [messageOk, setMessageOk] = useState(true);

  const [enabledPlatforms, setEnabledPlatforms] = useState<string[]>(
    initial.enabledPlatforms,
  );
  const [syncIntervalSec, setSyncIntervalSec] = useState(initial.syncIntervalSec);
  const [operatorEmail, setOperatorEmail] = useState(initial.operatorEmail);
  const [maxJobsPerCycle, setMaxJobsPerCycle] = useState(initial.maxJobsPerCycle);
  const [pace, setPace] = useState(derivePace(initial.paceMinMs, initial.paceMaxMs));

  function togglePlatform(p: string) {
    setEnabledPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }

  function doSave() {
    const chosen = PACE_CHOICES.find((c) => c.value === pace) ?? PACE_CHOICES[0];
    const input: BotSettingsInput = {
      enabledPlatforms,
      syncIntervalSec,
      operatorEmail,
      maxJobsPerCycle,
      paceMinMs: chosen.minMs,
      paceMaxMs: chosen.maxMs,
    };
    setMessage(null);
    startTransition(async () => {
      const res = await saveBotSettings(input);
      setMessage(res.message);
      setMessageOk(res.ok);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Plateformes */}
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-700">
          Plateformes
        </legend>
        <div className="flex flex-wrap gap-4">
          {(ALL_PLATFORMS as readonly string[]).map((p) => {
            const isSoon = COMING_SOON.has(p);
            return (
              <label
                key={p}
                className={
                  "flex items-center gap-2 text-sm " +
                  (isSoon ? "opacity-50" : "")
                }
              >
                <input
                  type="checkbox"
                  checked={enabledPlatforms.includes(p)}
                  onChange={() => !isSoon && togglePlatform(p)}
                  disabled={isSoon || pending}
                  className="disabled:cursor-not-allowed"
                />
                {PLATFORM_LABELS[p] ?? p}
                {isSoon && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                    bientôt
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Fréquence de sync */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="syncInterval"
          className="text-sm font-medium text-slate-700"
        >
          Fréquence de synchronisation
        </label>
        <select
          id="syncInterval"
          value={syncIntervalSec}
          onChange={(e) => setSyncIntervalSec(Number(e.target.value))}
          disabled={pending}
          className="rounded-md border border-slate-300 px-2 py-2 text-sm disabled:opacity-50"
        >
          {SYNC_INTERVAL_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Courriel opérateur */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="operatorEmail"
          className="text-sm font-medium text-slate-700"
        >
          Courriel de l&apos;opérateur
        </label>
        <input
          id="operatorEmail"
          type="email"
          value={operatorEmail}
          onChange={(e) => setOperatorEmail(e.target.value)}
          disabled={pending}
          placeholder="ops@example.com"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
        />
      </div>

      {/* Nombre max de jobs */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="maxJobs"
          className="text-sm font-medium text-slate-700"
        >
          Nombre max de jobs par cycle
        </label>
        <input
          id="maxJobs"
          type="number"
          min={1}
          max={100}
          value={maxJobsPerCycle}
          onChange={(e) => setMaxJobsPerCycle(Number(e.target.value))}
          disabled={pending}
          className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
        />
      </div>

      {/* Rythme */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="pace"
          className="text-sm font-medium text-slate-700"
        >
          Rythme
        </label>
        <select
          id="pace"
          value={pace}
          onChange={(e) => setPace(e.target.value)}
          disabled={pending}
          className="rounded-md border border-slate-300 px-2 py-2 text-sm disabled:opacity-50"
        >
          {PACE_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Bouton enregistrer */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={doSave}
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>

      {/* Message de retour */}
      {message && (
        <p
          className={
            "rounded-md border px-3 py-2 text-sm " +
            (messageOk
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800")
          }
        >
          {message}
        </p>
      )}
    </div>
  );
}
