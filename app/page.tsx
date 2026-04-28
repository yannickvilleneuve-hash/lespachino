import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchPublicListings } from "@/lib/listings/public";
import AppHeader from "@/app/app-header";
import CatalogViews from "@/app/catalog-views";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Camions à vendre — Centre du camion Hino",
  description:
    "Catalogue de camions commerciaux Hino neufs et usagés, boîtes de camion, remorques. Vente, financement, service.",
  openGraph: {
    title: "Camions à vendre — Centre du camion Hino",
    description:
      "Catalogue de camions commerciaux Hino neufs et usagés, boîtes de camion, remorques.",
    type: "website",
    locale: "fr_CA",
    siteName: "Centre du camion Hino",
  },
};

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
        {listings.length === 0 ? (
          <p className="text-gray-500 text-sm py-10 text-center">
            Aucun véhicule publié pour le moment.
          </p>
        ) : (
          <CatalogViews listings={listings} />
        )}
      </div>
    </main>
  );
}
