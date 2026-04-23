"use client";

import { useState, useTransition } from "react";
import { runLespacSync, type SyncLespacResult } from "@/lib/lespac/actions";

export default function SyncLespacButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SyncLespacResult | null>(null);

  function onClick() {
    setResult(null);
    startTransition(async () => {
      setResult(await runLespacSync());
    });
  }

  const summary = result?.ok
    ? {
        upserted: result.results.filter((r) => r.action === "upserted").length,
        deactivated: result.results.filter((r) => r.action === "deactivated").length,
        errors: result.results.filter((r) => r.action === "error").length,
      }
    : null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="text-xs text-white/70 hover:text-white disabled:opacity-40"
        title="Pousse tous les listings publiés vers Lespac via l'API REST"
      >
        {pending ? "Sync Lespac…" : "Sync Lespac"}
      </button>
      {result && (
        <div
          role="status"
          className="absolute right-0 top-full mt-1 w-80 bg-white text-gray-900 rounded shadow-lg border p-3 text-xs z-20"
        >
          {result.ok ? (
            <>
              <div className="font-semibold mb-1">Sync terminé</div>
              <div>
                ✅ {summary!.upserted} upsert · 💤 {summary!.deactivated} désactivé ·{" "}
                <span className={summary!.errors > 0 ? "text-red-600" : ""}>
                  ⚠ {summary!.errors} erreurs
                </span>
              </div>
              {summary!.errors > 0 && (
                <ul className="mt-2 max-h-40 overflow-y-auto">
                  {result.results
                    .filter((r) => r.action === "error")
                    .map((r) => (
                      <li key={r.unit} className="text-red-700">
                        <code>{r.unit}</code>: {r.error}
                      </li>
                    ))}
                </ul>
              )}
            </>
          ) : (
            <div className="text-red-700">{result.error}</div>
          )}
        </div>
      )}
    </div>
  );
}
