import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { fetchPublicListingByUnit } from "@/lib/listings/public";
import { logVehicleView } from "@/lib/stats/views";
import AppHeader from "@/app/app-header";
import Gallery from "./gallery";
import LeadForm from "./lead-form";
import PixelViewContent from "./pixel-view";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ unit: string }>;
}): Promise<Metadata> {
  const { unit } = await params;
  const detail = await fetchPublicListingByUnit(decodeURIComponent(unit));
  if (!detail) return { title: "Véhicule introuvable" };
  const title = `${detail.year} ${detail.make} ${detail.model} — ${currencyFmt.format(detail.price_cad)}`;
  const description =
    detail.description_fr ||
    `${detail.make} ${detail.model} ${detail.year} disponible chez Centre du camion Hino.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "fr_CA",
      siteName: "Centre du camion Hino",
      images: detail.hero_url ? [{ url: detail.hero_url, width: 1200, height: 900 }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: detail.hero_url ? [detail.hero_url] : undefined,
    },
  };
}

const currencyFmt = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

export default async function Page({
  params,
}: {
  params: Promise<{ unit: string }>;
}) {
  const { unit } = await params;
  const detail = await fetchPublicListingByUnit(decodeURIComponent(unit));
  if (!detail) notFound();

  const hdrs = await headers();
  // Fire-and-forget — ne pas attendre pour render.
  void logVehicleView({
    unit: detail.unit,
    userAgent: hdrs.get("user-agent"),
    ip: hdrs.get("x-forwarded-for")?.split(",")[0].trim() ?? hdrs.get("x-real-ip"),
    referrer: hdrs.get("referer"),
  });

  return (
    <main className="min-h-screen bg-gray-50">
      <PixelViewContent unit={detail.unit} price={detail.price_cad} />
      <AppHeader
        title={`${detail.year} ${detail.make} ${detail.model}`}
        right={
          <Link href="/" className="text-xs text-white/70 hover:text-white">
            ← Catalogue
          </Link>
        }
      />

      <div className="max-w-6xl mx-auto px-4 py-5 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section>
          <Gallery photos={detail.photos} alt={`${detail.make} ${detail.model} ${detail.year}`} />

          <h1 className="text-2xl font-bold mt-5">
            {detail.year} {detail.make} {detail.model}
          </h1>
          <p className="text-red-600 text-3xl font-bold font-mono mt-1">
            {currencyFmt.format(detail.price_cad)}
          </p>

          <dl className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm bg-white border rounded p-4">
            <Pair label="Catégorie" value={detail.category} />
            {detail.km > 0 && <Pair label="Kilométrage" value={`${detail.km.toLocaleString("fr-CA")} km`} />}
            {detail.color && <Pair label="Couleur" value={detail.color} />}
            <Pair label="Unit #" value={detail.unit} mono />
            <Pair label="VIN" value={detail.vin} mono />
          </dl>

          {detail.description_fr && (
            <article className="bg-white border rounded p-5 mt-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Description
              </h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {detail.description_fr}
              </p>
            </article>
          )}
        </section>

        <aside>
          <div className="bg-white border rounded p-4 sticky top-4">
            <a
              href="tel:+15555555555"
              className="block w-full bg-green-600 hover:bg-green-700 text-white text-center py-3 rounded font-semibold"
            >
              📞 Appeler
            </a>
            <p className="text-xs text-gray-500 mt-1 text-center">
              Ou laisse-nous tes coordonnées — on te rappelle.
            </p>
            <LeadForm unit={detail.unit} />
          </div>
        </aside>
      </div>
    </main>
  );
}

function Pair({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={"font-medium " + (mono ? "font-mono text-xs" : "")}>{value}</dd>
    </div>
  );
}
