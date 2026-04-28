"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import type { PublicListing } from "@/lib/listings/public";
import { ViewModeSwitcher, useViewMode, type ViewMode } from "./view-mode-switcher";

const currencyFmt = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

type SortKey = "year" | "make" | "model" | "category" | "km" | "price_cad";
type SortDir = "asc" | "desc";

export default function CatalogViews({ listings }: { listings: PublicListing[] }) {
  const [mode, setMode] = useViewMode("public", "list");
  const [sortKey, setSortKey] = useState<SortKey>("price_cad");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    const copy = [...listings];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const diff =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), "fr", { numeric: true, sensitivity: "base" });
      return sortDir === "asc" ? diff : -diff;
    });
    return copy;
  }, [listings, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "year" || k === "price_cad" ? "asc" : "asc");
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-600">
          {listings.length} véhicule{listings.length > 1 ? "s" : ""} disponible
          {listings.length > 1 ? "s" : ""}
        </p>
        <ViewModeSwitcher mode={mode} onChange={setMode} />
      </div>

      {mode === "grid" && <Grille listings={sorted} />}
      {mode === "list" && <Liste listings={sorted} />}
      {mode === "table" && (
        <Tableau
          listings={sorted}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
        />
      )}
    </>
  );
}

function Grille({ listings }: { listings: PublicListing[] }) {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {listings.map((l) => (
        <li key={l.unit}>
          <Link
            href={`/vehicule/${encodeURIComponent(l.unit)}`}
            className="block bg-white border rounded shadow-sm hover:shadow-md transition-shadow overflow-hidden"
          >
            <div className="relative aspect-[4/3] bg-gray-100">
              <Image
                src={l.hero_url}
                alt={`${l.make} ${l.model} ${l.year}`}
                fill
                sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw"
                className="object-cover"
                unoptimized
              />
              {l.photo_count > 1 && (
                <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded">
                  {l.photo_count} photos
                </span>
              )}
            </div>
            <div className="p-3">
              <div className="font-semibold text-sm truncate">
                {l.year} {l.make} {l.model}
              </div>
              <div className="text-xs text-gray-600 truncate mt-0.5">
                {l.category}
                {l.km > 0 ? ` · ${l.km.toLocaleString("fr-CA")} km` : ""}
                {l.color ? ` · ${l.color}` : ""}
              </div>
              <div className="flex items-baseline justify-between mt-2">
                <span className="text-lg font-bold text-red-600 font-mono">
                  {currencyFmt.format(l.price_cad)}
                </span>
                <span className="text-[10px] text-gray-400 font-mono">{l.unit}</span>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Liste({ listings }: { listings: PublicListing[] }) {
  return (
    <ul className="divide-y bg-white border rounded shadow-sm">
      {listings.map((l) => (
        <li key={l.unit}>
          <Link
            href={`/vehicule/${encodeURIComponent(l.unit)}`}
            className="flex items-center gap-4 px-3 py-2 hover:bg-blue-50"
          >
            <div className="relative w-[120px] h-[90px] flex-shrink-0 bg-gray-100 rounded overflow-hidden">
              <Image
                src={l.hero_url}
                alt={`${l.make} ${l.model} ${l.year}`}
                fill
                sizes="120px"
                className="object-cover"
                unoptimized
              />
              {l.photo_count > 1 && (
                <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-tl">
                  {l.photo_count} ph
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">
                {l.year} {l.make} {l.model}
              </div>
              <div className="text-xs text-gray-600 truncate">
                {l.category}
                {l.km > 0 ? ` · ${l.km.toLocaleString("fr-CA")} km` : ""}
                {l.color ? ` · ${l.color}` : ""}
              </div>
              {l.description_fr && (
                <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{l.description_fr}</p>
              )}
            </div>
            <div className="text-right pr-2">
              <div className="text-lg font-bold text-red-600 font-mono">
                {currencyFmt.format(l.price_cad)}
              </div>
              <div className="text-[10px] text-gray-400 font-mono">{l.unit}</div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Tableau({
  listings,
  sortKey,
  sortDir,
  onSort,
}: {
  listings: PublicListing[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const cols: { key: SortKey; label: string; align?: "right" }[] = [
    { key: "year", label: "Année", align: "right" },
    { key: "make", label: "Marque" },
    { key: "model", label: "Modèle" },
    { key: "category", label: "Catégorie" },
    { key: "km", label: "Km", align: "right" },
    { key: "price_cad", label: "Prix", align: "right" },
  ];
  return (
    <div className="overflow-x-auto bg-white border rounded shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wide">
          <tr>
            {cols.map((c) => {
              const active = c.key === sortKey;
              const arrow = active ? (sortDir === "asc" ? "▲" : "▼") : "";
              return (
                <th
                  key={c.key}
                  onClick={() => onSort(c.key)}
                  className={
                    "px-3 py-2 cursor-pointer select-none hover:text-gray-900 " +
                    (c.align === "right" ? "text-right " : "text-left ") +
                    (active ? "text-gray-900" : "")
                  }
                >
                  <span className="inline-flex items-center gap-1">
                    {c.label}
                    <span className={"text-[10px] " + (active ? "opacity-100" : "opacity-0")}>
                      {arrow || "▲"}
                    </span>
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {listings.map((l) => (
            <tr key={l.unit} className="border-t hover:bg-blue-50">
              <td className="px-3 py-1.5 text-right font-mono">
                <Link
                  href={`/vehicule/${encodeURIComponent(l.unit)}`}
                  className="text-blue-700 hover:underline"
                >
                  {l.year || "—"}
                </Link>
              </td>
              <td className="px-3 py-1.5">{l.make}</td>
              <td className="px-3 py-1.5">{l.model}</td>
              <td className="px-3 py-1.5 text-xs text-gray-600">{l.category}</td>
              <td className="px-3 py-1.5 text-right font-mono">
                {l.km > 0 ? l.km.toLocaleString("fr-CA") : "—"}
              </td>
              <td className="px-3 py-1.5 text-right font-mono font-bold text-red-600">
                {currencyFmt.format(l.price_cad)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
