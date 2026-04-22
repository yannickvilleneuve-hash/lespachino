"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { InventoryRow } from "@/lib/listings/queries";

const currencyFmt = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

export default function InventaireTable({ rows }: { rows: InventoryRow[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("");
  const [publishedOnly, setPublishedOnly] = useState(false);

  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.category))).filter(Boolean).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
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
  }, [rows, search, category, publishedOnly]);

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
        <span className="text-sm text-gray-500 ml-auto">{filtered.length} / {rows.length}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left">Unit</th>
              <th className="px-3 py-2 text-left">VIN</th>
              <th className="px-3 py-2 text-left">Année</th>
              <th className="px-3 py-2 text-left">Marque</th>
              <th className="px-3 py-2 text-left">Modèle</th>
              <th className="px-3 py-2 text-right">Km</th>
              <th className="px-3 py-2 text-left">Catégorie</th>
              <th className="px-3 py-2 text-right">Coûtant</th>
              <th className="px-3 py-2 text-right">Prix</th>
              <th className="px-3 py-2 text-center">Photos</th>
              <th className="px-3 py-2 text-center">Publié</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {filtered.map((r) => (
              <tr key={r.unit} className="border-t hover:bg-blue-50">
                <td className="px-3 py-1.5 font-mono text-xs">
                  <Link href={`/inventaire/${encodeURIComponent(r.unit)}`} className="text-blue-700 hover:underline">
                    {r.unit}
                  </Link>
                </td>
                <td className="px-3 py-1.5 font-mono text-xs">{r.vin}</td>
                <td className="px-3 py-1.5">{r.year || "—"}</td>
                <td className="px-3 py-1.5">{r.make}</td>
                <td className="px-3 py-1.5">{r.model}</td>
                <td className="px-3 py-1.5 text-right font-mono">{r.km.toLocaleString("fr-CA")}</td>
                <td className="px-3 py-1.5 text-xs text-gray-600">{r.category}</td>
                <td className="px-3 py-1.5 text-right font-mono text-gray-700">{currencyFmt.format(r.cost)}</td>
                <td className="px-3 py-1.5 text-right font-mono font-semibold">
                  {r.price_cad > 0 ? currencyFmt.format(r.price_cad) : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-3 py-1.5 text-center">
                  <span className={r.has_hero ? "text-gray-700" : "text-red-600"}>
                    {r.photo_count}
                    {!r.has_hero && r.photo_count > 0 ? "⚠" : ""}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-center">
                  {r.is_published ? (
                    <span className="inline-block px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">Publié</span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-gray-500">
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
