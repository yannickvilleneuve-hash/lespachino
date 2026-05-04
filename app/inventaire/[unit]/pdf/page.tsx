import Image from "next/image";
import { notFound } from "next/navigation";
import { fetchVehicleByUnit } from "@/lib/listings/queries";
import { publicPhotoUrl } from "@/lib/listings/public";
import { getDealerConfig } from "@/lib/dealer/config";
import PrintButton from "./print-button";

export const dynamic = "force-dynamic";

const currencyFmt = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

export default async function PdfPage({
  params,
}: {
  params: Promise<{ unit: string }>;
}) {
  const { unit } = await params;
  const detail = await fetchVehicleByUnit(decodeURIComponent(unit));
  if (!detail) notFound();
  const dealer = getDealerConfig();
  const photos = detail.photos.slice(0, 6).map((p) => ({
    id: p.id,
    url: publicPhotoUrl(p.storage_path, "medium"),
    isHero: p.is_hero,
  }));
  const hero = photos.find((p) => p.isHero) ?? photos[0];

  return (
    <main className="min-h-screen bg-white text-gray-950">
      <style>{`
        @page { size: letter; margin: 0.45in; }
        @media print {
          body { background: white !important; }
          .print-shadow { box-shadow: none !important; border-color: #ddd !important; }
        }
      `}</style>
      <div className="mx-auto max-w-4xl p-6 print:p-0">
        <div className="mb-5 flex items-center justify-between gap-4 print:hidden">
          <a href={`/inventaire/${encodeURIComponent(detail.unit)}`} className="text-sm text-blue-700">
            ← Retour
          </a>
          <PrintButton />
        </div>

        <section className="print-shadow rounded border p-6 shadow-sm">
          <header className="flex items-start justify-between gap-6 border-b pb-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">{dealer.name}</p>
              <h1 className="mt-1 text-3xl font-bold">
                {detail.year} {detail.make} {detail.model}
              </h1>
              <p className="mt-1 font-mono text-2xl font-bold text-red-600">
                {detail.price_cad > 0 ? currencyFmt.format(detail.price_cad) : "Prix sur demande"}
              </p>
            </div>
            <div className="text-right text-sm text-gray-700">
              {dealer.contact.phone && <div>{dealer.contact.phone}</div>}
              {dealer.contact.email && <div>{dealer.contact.email}</div>}
              <div>{dealer.address.city}, {dealer.address.region}</div>
            </div>
          </header>

          {hero && (
            <div className="relative mt-5 aspect-[16/10] overflow-hidden rounded border bg-gray-100">
              <Image src={hero.url} alt="" fill className="object-cover" unoptimized priority />
            </div>
          )}

          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Pair label="Unité" value={detail.unit} mono />
            <Pair label="VIN" value={detail.vin} mono />
            <Pair label="Kilométrage" value={`${detail.km.toLocaleString("fr-CA")} km`} />
            <Pair label="Catégorie" value={detail.category || "—"} />
            <Pair label="Couleur" value={detail.color || "—"} />
            <Pair label="Statut" value={detail.status || "—"} />
          </dl>

          {detail.description_fr && (
            <article className="mt-5 border-t pt-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Description
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                {detail.description_fr}
              </p>
            </article>
          )}

          {photos.length > 1 && (
            <section className="mt-5 grid grid-cols-3 gap-2 border-t pt-4">
              {photos.filter((p) => p.id !== hero?.id).slice(0, 5).map((p) => (
                <div key={p.id} className="relative aspect-[4/3] overflow-hidden rounded border bg-gray-100">
                  <Image src={p.url} alt="" fill className="object-cover" unoptimized />
                </div>
              ))}
            </section>
          )}
        </section>
      </div>
    </main>
  );
}

function Pair({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded border bg-gray-50 p-3">
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className={"mt-0.5 font-medium " + (mono ? "font-mono text-xs" : "")}>{value}</dd>
    </div>
  );
}
