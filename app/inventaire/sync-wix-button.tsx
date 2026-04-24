"use client";

import { useState, useTransition } from "react";
import { runWixSync, type SyncWixResult } from "@/lib/wix/actions";

export default function SyncWixButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SyncWixResult | null>(null);

  function onClick() {
    setResult(null);
    startTransition(async () => {
      setResult(await runWixSync());
    });
  }

  const summary = result?.ok
    ? {
        saved: result.results.filter((r) => r.action === "saved").length,
        removed: result.results.filter((r) => r.action === "removed").length,
        skipped: result.results.filter((r) => r.action === "skipped").length,
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
        title="Pousse les listings publiés vers la collection Wix Inventaire"
      >
        {pending ? "Sync Wix…" : "Sync Wix"}
      </button>
      {result && (
        <div
          role="status"
          className="absolute right-0 top-full mt-1 w-80 bg-white text-gray-900 rounded shadow-lg border p-3 text-xs z-20"
        >
          {result.ok ? (
            <>
              <div className="font-semibold mb-1">Sync Wix terminé</div>
              <div>
                ✅ {summary!.saved} saved · 🗑 {summary!.removed} removed · ⏭{" "}
                {summary!.skipped} skipped ·{" "}
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
