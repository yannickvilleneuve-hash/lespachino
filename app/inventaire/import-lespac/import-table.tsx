"use client";

import { useState, useTransition } from "react";
import { importLespacListing, type LespacImportRow } from "./actions";
import type { SertiCandidate } from "@/lib/lespac/import";
import type { SertiStatus } from "@/lib/serti/wgi";

const currencyFmt = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

const STATUS_LABELS: Record<SertiStatus, string> = {
  available: "Dispo",
  quoted: "Soumission",
  sold: "Vendu",
};

const STATUS_COLORS: Record<SertiStatus, string> = {
  available: "bg-emerald-100 text-emerald-800 border-emerald-300",
  quoted: "bg-amber-100 text-amber-800 border-amber-300",
  sold: "bg-red-100 text-red-800 border-red-300",
};

function StatusChip({ status }: { status: SertiStatus }) {
  return (
    <span
      className={
        "inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border " +
        STATUS_COLORS[status]
      }
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

interface RowState {
  unit: string;
  importPhotos: boolean;
  deactivateManual: boolean;
  publish: boolean;
  result: string | null;
  error: string | null;
}

function defaultPick(row: LespacImportRow): string {
  if (row.already_claimed_by) return row.already_claimed_by;
  if (row.matches.length > 0) return row.matches[0].unit;
  return "";
}

export default function ImportTable({
  rows,
  candidates,
}: {
  rows: LespacImportRow[];
  candidates: SertiCandidate[];
}) {
  const [state, setState] = useState<Record<number, RowState>>(() => {
    const init: Record<number, RowState> = {};
    for (const r of rows) {
      init[r.detail.listingId] = {
        unit: defaultPick(r),
        importPhotos: true,
        deactivateManual: true,
        publish: true,
        result: null,
        error: null,
      };
    }
    return init;
  });
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  function update(listingId: number, patch: Partial<RowState>) {
    setState((s) => ({ ...s, [listingId]: { ...s[listingId], ...patch } }));
  }

  function onImport(listingId: number) {
    const s = state[listingId];
    if (!s.unit) return;
    setPendingId(listingId);
    update(listingId, { result: null, error: null });
    startTransition(async () => {
      try {
        const r = await importLespacListing(listingId, s.unit, {
          import_photos: s.importPhotos,
          deactivate_manual: s.deactivateManual,
          publish: s.publish,
        });
        update(listingId, {
          result: `✅ Importé sur ${r.unit} — ${r.photos_imported} photo${r.photos_imported > 1 ? "s" : ""}${r.deactivated ? " · Lespac désactivée" : ""}`,
        });
      } catch (e) {
        update(listingId, { error: e instanceof Error ? e.message : String(e) });
      } finally {
        setPendingId(null);
      }
    });
  }

  if (rows.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 text-sm">
        Aucune annonce manuelle Lespac à rapatrier.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-7xl">
      <p className="text-sm text-gray-600">
        Annonces publiées manuellement sur Lespac (sans <code>vendorId</code>). Choisis l&apos;unité SERTI à rattacher, puis Importer pour rapatrier le prix interne, la description et les photos. Cocher &laquo;&nbsp;désactiver Lespac&nbsp;&raquo; pour qu&apos;elle disparaisse de Lespac (on republiera ensuite via API depuis le dashboard).
      </p>

      <div className="space-y-3">
        {rows.map((r) => {
          const s = state[r.detail.listingId];
          const a = r.detail.attributes ?? {};
          const km = parseInt(a["Kilométrage"] ?? "0", 10) || 0;
          const isPending = pendingId === r.detail.listingId;
          const selectedStatus: SertiStatus | null = s.unit
            ? (candidates.find((c) => c.unit === s.unit)?.status ?? null)
            : null;
          return (
            <div
              key={r.detail.listingId}
              className="bg-white border rounded p-4 grid gap-4 lg:grid-cols-[280px_1fr] items-start"
            >
              <div className="space-y-2">
                {r.detail.imageURLs?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.detail.imageURLs[0]}
                    alt={r.detail.title}
                    className="w-full aspect-[4/3] object-cover rounded border"
                  />
                ) : (
                  <div className="w-full aspect-[4/3] rounded border bg-gray-100 text-gray-400 text-xs flex items-center justify-center">
                    Pas de photo
                  </div>
                )}
                <div className="text-[11px] text-gray-500">
                  {r.detail.imageURLs?.length ?? 0} photo{(r.detail.imageURLs?.length ?? 0) > 1 ? "s" : ""}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="font-semibold text-sm">{r.detail.title.trim()}</h3>
                  <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span>
                      <strong>{a["Marque"] || "?"}</strong> {a["Modèle"] || ""}
                    </span>
                    {r.detail.year && <span>· {r.detail.year}</span>}
                    {km > 0 && <span>· {km.toLocaleString("fr-CA")} km</span>}
                    {r.detail.price && <span>· {currencyFmt.format(r.detail.price)}</span>}
                    <span>·{" "}
                      <a
                        href={`https://www.lespac.com/${r.detail.listingId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-700 hover:underline"
                      >
                        listing #{r.detail.listingId}
                      </a>
                    </span>
                  </div>
                  {r.already_claimed_by && (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1.5 inline-block">
                      Déjà rattachée à <code>{r.already_claimed_by}</code> — re-importer va écraser.
                    </div>
                  )}
                </div>

                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <div className="flex items-center gap-2">
                    <select
                      value={s.unit}
                      onChange={(e) => update(r.detail.listingId, { unit: e.target.value })}
                      className="flex-1 border rounded px-2 py-1.5 text-sm bg-white"
                    >
                      <option value="">— Pas de match SERTI —</option>
                      {r.matches.length > 0 && (
                        <optgroup label="Suggestions">
                          {r.matches.map((m) => {
                            const v = candidates.find((c) => c.unit === m.unit);
                            const tag = v ? `[${STATUS_LABELS[v.status]}] ` : "";
                            return (
                              <option key={"s_" + m.unit} value={m.unit}>
                                {tag}{m.unit} — {v?.year} {v?.make} {v?.model} ({m.score}pts: {m.reasons.join(", ")})
                              </option>
                            );
                          })}
                        </optgroup>
                      )}
                      <optgroup label="Tous les véhicules SERTI">
                        {candidates.map((c) => (
                          <option key={c.unit} value={c.unit}>
                            [{STATUS_LABELS[c.status]}] {c.unit} — {c.year} {c.make} {c.model} ({c.km.toLocaleString("fr-CA")} km)
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    {selectedStatus && <StatusChip status={selectedStatus} />}
                  </div>
                  <button
                    type="button"
                    onClick={() => onImport(r.detail.listingId)}
                    disabled={!s.unit || isPending}
                    className="bg-blue-700 text-white px-3 py-1.5 rounded text-sm disabled:opacity-40"
                  >
                    {isPending ? "Import…" : "Importer"}
                  </button>
                </div>
                {selectedStatus === "sold" && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                    ⚠ Ce véhicule est marqué <strong>vendu</strong> dans SERTI. Vérifie avant d&apos;importer (peut-être à juste désactiver Lespac sans rapatrier).
                  </div>
                )}
                {selectedStatus === "quoted" && (
                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    🔒 En soumission dans SERTI — l&apos;annonce reste valide tant que la transaction n&apos;est pas conclue.
                  </div>
                )}

                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-gray-700">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={s.importPhotos}
                      onChange={(e) => update(r.detail.listingId, { importPhotos: e.target.checked })}
                    />
                    Importer les photos
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={s.publish}
                      onChange={(e) => update(r.detail.listingId, { publish: e.target.checked })}
                    />
                    Publier sur le site natif
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={s.deactivateManual}
                      onChange={(e) => update(r.detail.listingId, { deactivateManual: e.target.checked })}
                    />
                    Désactiver Lespac manuelle (anti-doublon)
                  </label>
                </div>

                {s.result && <div className="text-xs text-green-700">{s.result}</div>}
                {s.error && <div className="text-xs text-red-700">{s.error}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
