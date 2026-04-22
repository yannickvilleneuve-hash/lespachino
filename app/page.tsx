import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { fetchPublicListings } from "@/lib/listings/public";
import AppHeader from "@/app/app-header";

export const dynamic = "force-dynamic";
export const revalidate = 60;

const currencyFmt = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

export default async function Home() {
  const [listings, { data: auth }] = await Promise.all([
    fetchPublicListings(),
    (await createClient()).auth.getUser(),
  ]);
  const isAuth = !!auth.user;

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader
        title="Catalogue"
        right={
          isAuth ? (
            <Link href="/inventaire" className="text-xs text-white/70 hover:text-white">
              Admin →
            </Link>
          ) : (
            <Link href="/login" className="text-xs text-white/70 hover:text-white">
              Connexion
            </Link>
          )
        }
      />

      <div className="max-w-6xl mx-auto px-4 py-5">
        <p className="text-sm text-gray-600 mb-4">
          {listings.length} véhicule{listings.length > 1 ? "s" : ""} disponible
          {listings.length > 1 ? "s" : ""}
        </p>

        {listings.length === 0 ? (
          <p className="text-gray-500 text-sm py-10 text-center">
            Aucun véhicule publié pour le moment.
          </p>
        ) : (
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
                      <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">
                        {l.description_fr}
                      </p>
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
        )}
      </div>
    </main>
  );
}
