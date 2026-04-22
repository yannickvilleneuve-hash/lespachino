import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchVehicleByVin } from "@/lib/listings/queries";
import { withSignedUrls } from "@/lib/listings/photos";
import { CHANNELS, type Channel } from "@/lib/listings/schema";
import ListingForm from "./listing-form";
import PhotoManager from "./photo-manager";

export const dynamic = "force-dynamic";

const currencyFmt = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 2,
});

export default async function EditPage({
  params,
}: {
  params: Promise<{ vin: string }>;
}) {
  const { vin } = await params;
  const detail = await fetchVehicleByVin(decodeURIComponent(vin));
  if (!detail) notFound();
  const photosWithUrls = await withSignedUrls(detail.photos);

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b">
        <div className="flex items-center gap-4">
          <Link href="/inventaire" className="text-sm text-gray-500 hover:underline">
            ← Inventaire
          </Link>
          <h1 className="text-xl font-semibold font-mono">{detail.unit || detail.vin}</h1>
          {detail.is_published && (
            <span className="inline-block px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">
              Publié
            </span>
          )}
        </div>
      </header>

      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_2fr] max-w-7xl">
        <aside className="bg-white p-5 rounded shadow space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Données SERTI (readonly)
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-gray-500">VIN</dt>
            <dd className="font-mono">{detail.vin}</dd>
            <dt className="text-gray-500">Unit</dt>
            <dd className="font-mono">{detail.unit || "—"}</dd>
            <dt className="text-gray-500">Année</dt>
            <dd>{detail.year || "—"}</dd>
            <dt className="text-gray-500">Marque</dt>
            <dd>{detail.make}</dd>
            <dt className="text-gray-500">Modèle</dt>
            <dd>{detail.model}</dd>
            <dt className="text-gray-500">Km</dt>
            <dd className="font-mono">{detail.km.toLocaleString("fr-CA")}</dd>
            <dt className="text-gray-500">Couleur</dt>
            <dd>{detail.color || "—"}</dd>
            <dt className="text-gray-500">Catégorie</dt>
            <dd>{detail.category}</dd>
            <dt className="text-gray-500">Statut</dt>
            <dd>{detail.status}</dd>
          </dl>
          <div className="pt-3 border-t">
            <p className="text-xs text-red-700 font-semibold uppercase tracking-wide">
              Coûtant interne — ne pas divulguer
            </p>
            <p className="font-mono text-lg mt-1">{currencyFmt.format(detail.cost)}</p>
          </div>
        </aside>

        <section className="bg-white p-5 rounded shadow">
          <ListingForm
            vin={detail.vin}
            defaults={{
              price_cad: detail.price_cad,
              description_fr: detail.description_fr,
              channels: detail.channels.filter((c): c is Channel =>
                (CHANNELS as readonly string[]).includes(c),
              ),
            }}
            isPublished={detail.is_published}
          />
          <div className="mt-6 pt-6 border-t">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Photos
            </h2>
            <PhotoManager vin={detail.vin} initialPhotos={photosWithUrls} />
          </div>
        </section>
      </div>
    </main>
  );
}
