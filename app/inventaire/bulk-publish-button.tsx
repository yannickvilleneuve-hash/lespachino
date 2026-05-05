"use client";

import { useState, useTransition } from "react";
import { bulkPublishReady, type BulkPublishResult } from "@/lib/listings/actions";

const REASON_LABELS: Record<keyof BulkPublishResult["reasons"], string> = {
  description_missing: "manque description",
  no_photos: "aucune photo",
  no_hero: "pas de photo principale",
  not_available: "non disponible SERTI",
  price_missing: "prix requis pour Meta/Google",
  no_channels: "aucune plateforme choisie",
};

export default function BulkPublishButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<BulkPublishResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function onClick() {
    setResult(null);
    setErr(null);
    startTransition(async () => {
      try {
        setResult(await bulkPublishReady());
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-800 disabled:opacity-40"
        title="Publie tous les véhicules prêts (description et photo principale)"
      >
        {pending ? "Publication…" : "Publier prêts"}
      </button>
      {result && (
        <div
          role="status"
          className="absolute right-0 top-full mt-1 w-72 bg-white text-gray-900 rounded shadow-lg border p-3 text-xs z-20"
        >
          <div className="font-semibold mb-1">Bulk publish</div>
          <div>
            ✅ {result.published} publié{result.published > 1 ? "s" : ""} · ⏭ {result.skipped}{" "}
            ignoré{result.skipped > 1 ? "s" : ""}
          </div>
          {Object.entries(result.reasons).some(([, n]) => n > 0) && (
            <ul className="mt-2 text-gray-600 space-y-0.5">
              {Object.entries(result.reasons)
                .filter(([, n]) => n > 0)
                .map(([k, n]) => (
                  <li key={k}>
                    {n} × {REASON_LABELS[k as keyof BulkPublishResult["reasons"]]}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
      {err && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-red-50 text-red-800 rounded shadow-lg border border-red-200 p-3 text-xs z-20">
          {err}
        </div>
      )}
    </div>
  );
}
