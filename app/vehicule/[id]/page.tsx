import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Oswald } from "next/font/google";
import { resolveVehicleForPage, photoSrc } from "@/lib/catalog/read";
import { hasPlausibleOdometer } from "@/lib/feeds/eligibility";
import { getDealerConfig, telHref } from "@/lib/dealer/config";
import type { CatalogVehicle } from "@/lib/catalog/types";
import { LeadForm } from "./LeadForm";

export const revalidate = 900;

const oswald = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"] });

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * One resolution per request, shared by generateMetadata and the component, so
 * the two can never disagree — including on the live-fallback path, where a
 * second call would mean a second LesPAC round-trip.
 */
const loadVehicle = cache((id: string) => resolveVehicleForPage(id));

function displayTitle(v: CatalogVehicle): string {
  const parts = [v.year, v.make, v.model].filter((p) => p !== null && p !== "");
  return parts.join(" ").trim() || v.title;
}

function displayPrice(priceCad: number | null): string {
  if (priceCad == null) return "Prix à discuter";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(priceCad);
}

const TRANSMISSION_FR = { AUTOMATIC: "Automatique", MANUAL: "Manuelle" } as const;
const FUEL_FR = { DIESEL: "Diesel", GASOLINE: "Essence" } as const;

/** Compact spec chips — the numbers a truck buyer scans first. */
function specs(v: CatalogVehicle): Array<[string, string]> {
  const rows: Array<[string, string]> = [["État", v.isNew ? "Neuf" : "Usagé"]];
  // Same bar as the feeds: a placeholder odometer is worse than no odometer.
  if (hasPlausibleOdometer(v)) {
    rows.push(["Kilométrage", `${new Intl.NumberFormat("fr-CA").format(v.km!)} km`]);
  }
  if (v.transmission) rows.push(["Transmission", TRANSMISSION_FR[v.transmission]]);
  if (v.fuelType) rows.push(["Carburant", FUEL_FR[v.fuelType]]);
  if (v.exteriorColor) rows.push(["Couleur", v.exteriorColor]);
  return rows;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const row = await loadVehicle(id);
  if (!row) notFound();

  const vehicle = row.vehicle;
  const title = displayTitle(vehicle);
  return {
    title: `${title} — ${getDealerConfig().name}`,
    description: vehicle.description.slice(0, 160) || title,
    // A withdrawn ad must not stay in the index competing with the live ones.
    robots: row.status === "sold" ? { index: false } : undefined,
    openGraph: {
      title,
      description: vehicle.description.slice(0, 200) || title,
      images: row.photos[0] ? [photoSrc(row.photos[0])] : [],
      type: "website",
    },
  };
}

export default async function VehiclePage({ params }: PageProps) {
  const { id } = await params;
  const row = await loadVehicle(id);
  if (!row) notFound();

  const vehicle = row.vehicle;
  const withdrawn = row.status === "sold";
  const dealer = getDealerConfig();
  const title = displayTitle(vehicle);
  const tel = telHref(dealer.contact.phone);
  const hero = row.photos[0] ? photoSrc(row.photos[0]) : undefined;

  return (
    <main
      className={`${oswald.className} relative flex min-h-screen flex-col bg-[#0e0e0f] text-white lg:h-screen lg:overflow-hidden`}
    >
      {/* Brand bar — echoes camion-hino.ca: black, red block, phone at right. */}
      <header className="z-10 flex items-center justify-between border-b border-white/10 px-5 py-3 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="block h-6 w-6 bg-[#ed1c24]" aria-hidden />
          <span className="text-sm font-bold uppercase leading-none tracking-widest sm:text-base">
            Centre du Camion
            <span className="block text-[10px] font-medium tracking-[0.35em] text-white/50">
              Chicoutimi
            </span>
          </span>
        </div>
        {dealer.contact.phone && (
          <a
            href={tel ?? undefined}
            className="text-right text-sm font-semibold tracking-wide text-white/80 transition hover:text-white sm:text-base"
          >
            <span className="hidden text-[10px] uppercase tracking-[0.3em] text-white/40 sm:block">
              Contactez-nous
            </span>
            {dealer.contact.phone}
          </a>
        )}
      </header>

      <div className="grid flex-1 lg:grid-cols-[1.15fr_1fr]">
        {/* LEFT — single hero photo, title + price slab overlaid. */}
        <section className="relative min-h-[42vh] overflow-hidden lg:min-h-0">
          {hero && (
            <Image
              src={hero}
              alt={title}
              fill
              priority
              unoptimized
              className="object-cover"
              sizes="(min-width: 1024px) 55vw, 100vw"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e0f] via-[#0e0e0f]/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
            <h1 className="text-3xl font-bold uppercase leading-[0.95] tracking-tight sm:text-5xl">
              {title}
            </h1>
            <p className="mt-4">
              <span className="inline-block bg-[#ed1c24] px-4 py-1.5 text-2xl font-bold tracking-tight sm:text-3xl">
                {displayPrice(vehicle.priceCad)}
              </span>
            </p>
            <dl className="mt-4 flex flex-wrap gap-2">
              {specs(vehicle).map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-full border border-white/15 bg-white/5 px-3 py-1 backdrop-blur-sm"
                >
                  <dt className="inline text-[10px] uppercase tracking-widest text-white/45">
                    {label}&nbsp;
                  </dt>
                  <dd className="inline text-sm font-semibold text-white">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* RIGHT — contact panel. */}
        <section className="flex flex-col justify-center gap-4 bg-[#141416] px-5 py-8 sm:px-10 lg:overflow-y-auto">
          {withdrawn ? (
            <div className="border border-[#ed1c24]/40 bg-[#ed1c24]/10 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#ed1c24]">
                Cette annonce n&apos;est plus en ligne
              </p>
              <p className="mt-2 text-sm text-white/70">
                Ce véhicule a été vendu ou retiré. Voyez l&apos;inventaire à jour.
              </p>
              <Link
                href="/vehicule"
                className="mt-3 inline-block bg-[#ed1c24] px-4 py-2 text-sm font-bold uppercase tracking-wide text-white"
              >
                Voir l&apos;inventaire
              </Link>
            </div>
          ) : (
            <div>
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#ed1c24]">
                <span className="block h-3 w-3 bg-[#ed1c24]" aria-hidden />
                Ce camion vous intéresse?
              </p>
              <h2 className="mt-2 text-2xl font-bold uppercase leading-tight tracking-tight sm:text-3xl">
                Écrivez-nous, on vous répond vite
              </h2>
            </div>
          )}

          {vehicle.description && (
            <div className="max-h-40 overflow-y-auto rounded border border-white/10 bg-white/5 px-4 py-3 lg:max-h-48">
              <p className="whitespace-pre-line text-sm leading-relaxed text-white/70">
                {vehicle.description}
              </p>
            </div>
          )}

          {!withdrawn && <LeadForm unit={vehicle.id} title={title} />}

          {tel && (
            <p className="text-sm text-white/45">
              Ou appelez-nous&nbsp;:{" "}
              <a href={tel} className="font-semibold text-white/80 hover:text-white">
                {dealer.contact.phone}
              </a>
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
