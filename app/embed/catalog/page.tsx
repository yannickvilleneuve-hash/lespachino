import Image from "next/image";
import type { Metadata } from "next";
import { fetchPublicListings } from "@/lib/listings/public";
import { VehiclePlaceholder } from "@/app/vehicle-placeholder";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Inventaire — Centre du camion Hino",
  robots: { index: false },
};

const currencyFmt = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

export default async function EmbedCatalog() {
  const listings = await fetchPublicListings();
  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  return (
    <main className="bg-white font-sans">
      <div className="px-3 py-2 border-b bg-gray-50 flex items-center gap-3 text-xs text-gray-600">
        <span className="font-semibold text-sm text-gray-900">Inventaire</span>
        <span className="text-gray-500">
          {listings.length} véhicule{listings.length > 1 ? "s" : ""} disponible
          {listings.length > 1 ? "s" : ""}
        </span>
      </div>

      {listings.length === 0 ? (
        <p className="text-gray-500 text-sm py-10 text-center">
          Aucun véhicule publié pour le moment.
        </p>
      ) : (
        <ul className="divide-y">
          {listings.map((l) => {
            const href = `${siteOrigin}/vehicule/${encodeURIComponent(l.unit)}`;
            return (
              <li key={l.unit}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 hover:bg-blue-50"
                >
                  <div className="relative w-[110px] h-[82px] flex-shrink-0 bg-gray-100 rounded overflow-hidden">
                    {l.hero_url ? (
                      <Image
                        src={l.hero_url}
                        alt={`${l.make} ${l.model}`}
                        fill
                        sizes="110px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <VehiclePlaceholder className="absolute inset-0" />
                    )}
                    {l.photo_count > 1 && (
                      <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[10px] px-1 rounded-tl">
                        {l.photo_count}
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
                      <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">
                        {l.description_fr}
                      </p>
                    )}
                  </div>
                  <div className="text-right pl-2 flex-shrink-0">
                    <div className="text-base font-bold text-red-600 font-mono">
                      {currencyFmt.format(l.price_cad)}
                    </div>
                    <div className="text-[10px] text-gray-400 font-mono">{l.unit}</div>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
