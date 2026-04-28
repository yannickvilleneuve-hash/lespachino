"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { setHidden } from "@/lib/listings/actions";
import type { InventoryRow } from "@/lib/listings/queries";
import { ViewModeSwitcher, useViewMode } from "@/app/view-mode-switcher";

const currencyFmt = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

type SortKey =
  | "unit"
  | "vin"
  | "year"
  | "make"
  | "model"
  | "km"
  | "category"
  | "cost"
  | "price_cad"
  | "photo_count"
  | "is_published"
  | "date_added"
  | "views_7d"
  | "leads_7d";
type SortDir = "asc" | "desc";

interface ColumnDef {
  key: SortKey;
  label: string;
  align?: "left" | "right" | "center";
  render: (r: InventoryRow) => React.ReactNode;
  value: (r: InventoryRow) => string | number | boolean | null;
}

const COLUMNS: ColumnDef[] = [
  {
    key: "unit",
    label: "Unit",
    render: (r) => (
      <Link
        href={`/inventaire/${encodeURIComponent(r.unit)}`}
        className="text-blue-700 hover:underline font-mono text-xs"
      >
        {r.unit}
      </Link>
    ),
    value: (r) => r.unit,
  },
  {
    key: "vin",
    label: "VIN",
    render: (r) => <span className="font-mono text-xs">{r.vin}</span>,
    value: (r) => r.vin,
  },
  {
    key: "year",
    label: "Année",
    align: "right",
    render: (r) => r.year || "—",
    value: (r) => r.year,
  },
  { key: "make", label: "Marque", render: (r) => r.make, value: (r) => r.make },
  { key: "model", label: "Modèle", render: (r) => r.model, value: (r) => r.model },
  {
    key: "km",
    label: "Km",
    align: "right",
    render: (r) => <span className="font-mono">{r.km.toLocaleString("fr-CA")}</span>,
    value: (r) => r.km,
  },
  {
    key: "category",
    label: "Catégorie",
    render: (r) => <span className="text-xs text-gray-600">{r.category}</span>,
    value: (r) => r.category,
  },
  {
    key: "date_added",
    label: "Ajouté",
    render: (r) =>
      r.date_added ? (
        <span className="font-mono text-xs">{r.date_added}</span>
      ) : (
        <span className="text-gray-400">—</span>
      ),
    value: (r) => r.date_added ?? "",
  },
  {
    key: "cost",
    label: "Coûtant",
    align: "right",
    render: (r) => (
      <span className="font-mono text-gray-700">{currencyFmt.format(r.cost)}</span>
    ),
    value: (r) => r.cost,
  },
  {
    key: "price_cad",
    label: "Prix",
    align: "right",
    render: (r) =>
      r.price_cad > 0 ? (
        <span className="font-mono font-semibold">{currencyFmt.format(r.price_cad)}</span>
      ) : (
        <span className="text-gray-400">—</span>
      ),
    value: (r) => r.price_cad,
  },
  {
    key: "photo_count",
    label: "Photos",
    align: "center",
    render: (r) => (
      <span className={r.has_hero || r.photo_count === 0 ? "text-gray-700" : "text-red-600"}>
        {r.photo_count}
        {r.photo_count > 0 && !r.has_hero ? "⚠" : ""}
      </span>
    ),
    value: (r) => r.photo_count,
  },
  {
    key: "views_7d",
    label: "Vues 7j",
    align: "right",
    render: (r) => (
      <span className={r.views_7d > 0 ? "font-mono" : "font-mono text-gray-400"}>
        {r.views_7d}
      </span>
    ),
    value: (r) => r.views_7d,
  },
  {
    key: "leads_7d",
    label: "Leads 7j",
    align: "right",
    render: (r) => (
      <span
        className={
          r.leads_7d > 0 ? "font-mono font-semibold text-green-700" : "font-mono text-gray-400"
        }
      >
        {r.leads_7d}
      </span>
    ),
    value: (r) => r.leads_7d,
  },
  {
    key: "is_published",
    label: "Publié",
    align: "center",
    render: (r) =>
      r.is_published ? (
        <span className="inline-block px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">
          Publié
        </span>
      ) : (
        <span className="text-xs text-gray-400">—</span>
      ),
    value: (r) => r.is_published,
  },
];

const DEFAULT_DIR: Record<SortKey, SortDir> = {
  unit: "asc",
  vin: "asc",
  year: "desc",
  make: "asc",
  model: "asc",
  km: "asc",
  category: "asc",
  date_added: "desc",
  cost: "desc",
  price_cad: "desc",
  photo_count: "desc",
  is_published: "desc",
  views_7d: "desc",
  leads_7d: "desc",
};

function compareValues(a: string | number | boolean | null, b: string | number | boolean | null) {
  if (a === b) return 0;
  if (a === null || a === "") return 1;
  if (b === null || b === "") return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return (a ? 1 : 0) - (b ? 1 : 0);
  return String(a).localeCompare(String(b), "fr", { numeric: true, sensitivity: "base" });
}

export default function InventaireTable({ rows }: { rows: InventoryRow[] }) {
  const router = useRouter();
  const [mode, setMode] = useViewMode("admin", "table");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");
  const [publishedOnly, setPublishedOnly] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("unit");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [pending, startTransition] = useTransition();
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.category))).filter(Boolean).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showHidden && r.hidden) return false;
      if (publishedOnly && !r.is_published) return false;
      if (category && r.category !== category) return false;
      if (!q) return true;
      return (
        r.vin.toLowerCase().includes(q) ||
        r.unit.toLowerCase().includes(q) ||
        r.make.toLowerCase().includes(q) ||
        r.model.toLowerCase().includes(q)
      );
    });
  }, [rows, search, category, publishedOnly, showHidden]);

  const sorted = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sortKey);
    if (!col) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const diff = compareValues(col.value(a), col.value(b));
      return sortDir === "asc" ? diff : -diff;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(DEFAULT_DIR[key]);
    }
  }

  function onHide(row: InventoryRow) {
    const ok = window.confirm(
      `Retirer « ${row.unit} » de la liste ?\n\n` +
        "Le véhicule reste dans Merlin/SERTI (source de vérité).\n" +
        "Seulement caché de notre inventaire. Réactivable via « Afficher cachés ».",
    );
    if (!ok) return;
    setErrMsg(null);
    startTransition(async () => {
      try {
        await setHidden(row.unit, true);
      } catch (e) {
        setErrMsg((e as Error).message);
      }
    });
  }

  function onRestore(row: InventoryRow) {
    setErrMsg(null);
    startTransition(async () => {
      try {
        await setHidden(row.unit, false);
      } catch (e) {
        setErrMsg((e as Error).message);
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-center px-6 py-3 bg-white border-b">
        <input
          type="search"
          placeholder="VIN, unit#, make, model…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] border rounded px-3 py-1.5 text-sm"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm bg-white"
        >
          <option value="">Toutes catégories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={publishedOnly}
            onChange={(e) => setPublishedOnly(e.target.checked)}
          />
          Publiés seulement
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
          />
          Afficher cachés
        </label>
        <span className="text-sm text-gray-500 ml-auto">
          {sorted.length} / {rows.length}
        </span>
        <ViewModeSwitcher mode={mode} onChange={setMode} />
      </div>

      {errMsg && (
        <div className="px-6 py-2 bg-red-50 text-sm text-red-700 border-b">{errMsg}</div>
      )}

      {mode === "grid" && (
        <AdminGrille
          rows={sorted}
          onHide={onHide}
          onRestore={onRestore}
          pending={pending}
        />
      )}
      {mode === "list" && (
        <AdminListe
          rows={sorted}
          onHide={onHide}
          onRestore={onRestore}
          pending={pending}
        />
      )}

      {mode === "table" && (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wide">
            <tr>
              {COLUMNS.map((col) => {
                const active = col.key === sortKey;
                const arrow = active ? (sortDir === "asc" ? "▲" : "▼") : "";
                const align =
                  col.align === "right"
                    ? "text-right"
                    : col.align === "center"
                      ? "text-center"
                      : "text-left";
                return (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    className={`px-3 py-2 ${align} cursor-pointer select-none hover:text-gray-900 ${
                      active ? "text-gray-900" : ""
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      <span className={"text-[10px] " + (active ? "opacity-100" : "opacity-0")}>
                        {arrow || "▲"}
                      </span>
                    </span>
                  </th>
                );
              })}
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {sorted.map((r) => (
              <tr
                key={r.unit}
                onClick={() => router.push(`/inventaire/${encodeURIComponent(r.unit)}`)}
                className={
                  "border-t hover:bg-blue-50 cursor-pointer " +
                  (r.hidden ? "bg-gray-50 text-gray-500" : "")
                }
              >
                {COLUMNS.map((col) => {
                  const align =
                    col.align === "right"
                      ? "text-right"
                      : col.align === "center"
                        ? "text-center"
                        : "text-left";
                  return (
                    <td key={col.key} className={`px-3 py-1.5 ${align}`}>
                      {col.render(r)}
                    </td>
                  );
                })}
                <td
                  className="px-2 py-1.5 text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  {r.hidden ? (
                    <button
                      type="button"
                      onClick={() => onRestore(r)}
                      disabled={pending}
                      title="Restaurer dans l'inventaire"
                      className="text-green-600 hover:text-green-800 disabled:opacity-40 text-lg leading-none"
                    >
                      ↩
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onHide(r)}
                      disabled={pending}
                      title="Retirer de la liste (reste dans Merlin)"
                      className="inline-flex items-center justify-center text-red-600 hover:text-red-800 disabled:opacity-40"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="w-6 h-6"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.07a3 3 0 0 1-2.991 2.77H8.084a3 3 0 0 1-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 0 1 3.369 0c1.603.051 2.815 1.387 2.815 2.951Zm-6.136-1.452a51.196 51.196 0 0 1 3.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 0 0-6 0v-.113c0-.794.609-1.428 1.364-1.452ZM9.75 9a.75.75 0 0 1 .75.75v9a.75.75 0 0 1-1.5 0v-9A.75.75 0 0 1 9.75 9Zm4.5 0a.75.75 0 0 1 .75.75v9a.75.75 0 0 1-1.5 0v-9a.75.75 0 0 1 .75-.75Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-3 py-8 text-center text-gray-500">
                  Aucun véhicule
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

function HideButton({
  row,
  onHide,
  onRestore,
  pending,
}: {
  row: InventoryRow;
  onHide: (r: InventoryRow) => void;
  onRestore: (r: InventoryRow) => void;
  pending: boolean;
}) {
  if (row.hidden) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRestore(row);
        }}
        disabled={pending}
        title="Restaurer dans l'inventaire"
        className="text-green-600 hover:text-green-800 disabled:opacity-40 text-lg leading-none"
      >
        ↩
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onHide(row);
      }}
      disabled={pending}
      title="Retirer de la liste (reste dans Merlin)"
      className="inline-flex items-center justify-center text-red-600 hover:text-red-800 disabled:opacity-40"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
        <path
          fillRule="evenodd"
          d="M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.07a3 3 0 0 1-2.991 2.77H8.084a3 3 0 0 1-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 0 1 3.369 0c1.603.051 2.815 1.387 2.815 2.951Zm-6.136-1.452a51.196 51.196 0 0 1 3.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 0 0-6 0v-.113c0-.794.609-1.428 1.364-1.452ZM9.75 9a.75.75 0 0 1 .75.75v9a.75.75 0 0 1-1.5 0v-9A.75.75 0 0 1 9.75 9Zm4.5 0a.75.75 0 0 1 .75.75v9a.75.75 0 0 1-1.5 0v-9a.75.75 0 0 1 .75-.75Z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  );
}

function PublishedBadge({ published }: { published: boolean }) {
  return published ? (
    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-green-100 text-green-800 font-medium">
      Publié
    </span>
  ) : (
    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-500">
      Brouillon
    </span>
  );
}

function AdminGrille({
  rows,
  onHide,
  onRestore,
  pending,
}: {
  rows: InventoryRow[];
  onHide: (r: InventoryRow) => void;
  onRestore: (r: InventoryRow) => void;
  pending: boolean;
}) {
  if (rows.length === 0) {
    return <p className="px-6 py-8 text-center text-gray-500 text-sm">Aucun véhicule</p>;
  }
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
      {rows.map((r) => (
        <li
          key={r.unit}
          className={
            "relative bg-white border rounded shadow-sm hover:shadow-md transition-shadow " +
            (r.hidden ? "opacity-60" : "")
          }
        >
          <Link
            href={`/inventaire/${encodeURIComponent(r.unit)}`}
            className="block overflow-hidden rounded"
          >
            <div className="relative aspect-[4/3] bg-gray-100">
              {r.hero_url ? (
                <Image
                  src={r.hero_url}
                  alt={`${r.make} ${r.model} ${r.year}`}
                  fill
                  sizes="(max-width:640px) 100vw, (max-width:1024px) 33vw, 25vw"
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-xs">
                  pas de photo
                </div>
              )}
              <div className="absolute top-1.5 left-1.5">
                <PublishedBadge published={r.is_published} />
              </div>
              {r.photo_count > 1 && (
                <span className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                  {r.photo_count} ph
                </span>
              )}
            </div>
            <div className="p-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-xs text-blue-700">{r.unit}</span>
                <span className="text-[10px] text-gray-400">{r.date_added ?? ""}</span>
              </div>
              <div className="font-semibold text-sm truncate mt-0.5">
                {r.year} {r.make} {r.model}
              </div>
              <div className="text-xs text-gray-600 truncate">
                {r.category}
                {r.km > 0 ? ` · ${r.km.toLocaleString("fr-CA")} km` : ""}
              </div>
              <div className="flex items-baseline justify-between mt-1.5">
                <span className="font-mono text-sm font-bold">
                  {r.price_cad > 0 ? currencyFmt.format(r.price_cad) : "—"}
                </span>
                <span className="font-mono text-xs text-red-600" title="Coûtant — ne pas divulguer">
                  {currencyFmt.format(r.cost)}
                </span>
              </div>
            </div>
          </Link>
          <div className="absolute top-1.5 right-1.5 bg-white/90 rounded p-0.5">
            <HideButton row={r} onHide={onHide} onRestore={onRestore} pending={pending} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function AdminListe({
  rows,
  onHide,
  onRestore,
  pending,
}: {
  rows: InventoryRow[];
  onHide: (r: InventoryRow) => void;
  onRestore: (r: InventoryRow) => void;
  pending: boolean;
}) {
  if (rows.length === 0) {
    return <p className="px-6 py-8 text-center text-gray-500 text-sm">Aucun véhicule</p>;
  }
  return (
    <ul className="divide-y bg-white">
      {rows.map((r) => (
        <li
          key={r.unit}
          className={
            "flex items-center gap-3 px-3 py-2 hover:bg-blue-50 " +
            (r.hidden ? "bg-gray-50 text-gray-500" : "")
          }
        >
          <Link
            href={`/inventaire/${encodeURIComponent(r.unit)}`}
            className="flex items-center gap-3 flex-1 min-w-0"
          >
            <div className="relative w-[100px] h-[75px] flex-shrink-0 bg-gray-100 rounded overflow-hidden">
              {r.hero_url ? (
                <Image
                  src={r.hero_url}
                  alt=""
                  fill
                  sizes="100px"
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-[10px]">
                  ∅
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-mono text-blue-700">{r.unit}</span>
                <PublishedBadge published={r.is_published} />
                {r.date_added && (
                  <span className="text-gray-400 font-mono">{r.date_added}</span>
                )}
              </div>
              <div className="font-semibold text-sm truncate">
                {r.year} {r.make} {r.model}
              </div>
              <div className="text-xs text-gray-600 truncate">
                {r.category}
                {r.km > 0 ? ` · ${r.km.toLocaleString("fr-CA")} km` : ""}
                {r.color ? ` · ${r.color}` : ""}
              </div>
            </div>
            <div className="text-right pr-2 flex-shrink-0">
              <div className="font-mono font-bold text-sm">
                {r.price_cad > 0 ? currencyFmt.format(r.price_cad) : "—"}
              </div>
              <div
                className="font-mono text-[11px] text-red-600"
                title="Coûtant — ne pas divulguer"
              >
                {currencyFmt.format(r.cost)}
              </div>
            </div>
          </Link>
          <div className="flex-shrink-0">
            <HideButton row={r} onHide={onHide} onRestore={onRestore} pending={pending} />
          </div>
        </li>
      ))}
    </ul>
  );
}
