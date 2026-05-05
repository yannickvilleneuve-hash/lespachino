"use client";

import { useState } from "react";

export default function SandhillsHelper({
  feedUrl,
  vipUrl,
  units,
}: {
  feedUrl: string;
  vipUrl: string;
  units: string[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});

  async function copyFeedUrl() {
    await navigator.clipboard.writeText(feedUrl);
    setMessage("URL copiée.");
  }

  async function copyAndOpen() {
    await copyFeedUrl();
    window.open(vipUrl, "_blank", "noopener,noreferrer");
  }

  async function copyUnitList() {
    await navigator.clipboard.writeText(units.join("\n"));
    setMessage("Liste d'unités copiée.");
  }

  const steps = [
    ["login", "Connexion MarketBook ouverte"],
    ["url", "URL du feed collée ou CSV téléversé"],
    ["import", "Import lancé"],
    ["history", "Historique d'import vérifié"],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyAndOpen}
          className="rounded bg-green-700 px-3 py-2 text-sm font-medium text-white hover:bg-green-800"
        >
          Copier URL + ouvrir VIP
        </button>
        <button
          type="button"
          onClick={copyFeedUrl}
          className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
        >
          Copier URL
        </button>
        <a
          href="/feed/sandhills.csv"
          className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
          download
        >
          Télécharger CSV
        </a>
        <button
          type="button"
          onClick={copyUnitList}
          className="rounded border px-3 py-2 text-sm hover:bg-gray-50"
        >
          Copier unités
        </button>
      </div>

      {message && <p className="text-sm text-emerald-700">{message}</p>}

      <div className="border rounded bg-white">
        <div className="border-b bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Validation manuelle
        </div>
        <div className="divide-y">
          {steps.map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(done[key])}
                onChange={(event) =>
                  setDone((current) => ({ ...current, [key]: event.target.checked }))
                }
              />
              <span className={done[key] ? "text-gray-500 line-through" : "text-gray-800"}>
                {label}
              </span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
