"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { setHidden } from "@/lib/listings/actions";
import type { InventoryRow } from "@/lib/listings/queries";

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
  | "date_added";
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
      </div>

      {errMsg && (
        <div className="px-6 py-2 bg-red-50 text-sm text-red-700 border-b">{errMsg}</div>
      )}

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
                className={
                  "border-t hover:bg-blue-50 " + (r.hidden ? "bg-gray-50 text-gray-500" : "")
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
                <td className="px-2 py-1.5 text-center">
                  {r.hidden ? (
                    <button
                      type="button"
                      onClick={() => onRestore(r)}
                      disabled={pending}
                      title="Restaurer dans l'inventaire"
                      className="text-green-600 hover:text-green-800 disabled:opacity-40"
                    >
                      ↩
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onHide(r)}
                      disabled={pending}
                      title="Retirer de la liste (reste dans Merlin)"
                      className="text-gray-400 hover:text-red-600 disabled:opacity-40"
                    >
                      🗑
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
    </div>
  );
}
