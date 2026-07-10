import { cache } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getVehicleById } from "@/lib/catalog/fetch";
import { getDealerConfig, telHref } from "@/lib/dealer/config";
import type { CatalogVehicle } from "@/lib/catalog/types";

export const revalidate = 900;

interface PageProps {
  params: Promise<{ id: string }>;
}

/** One LesPAC fetch per request, shared by generateMetadata and the component. */
const loadVehicle = cache(getVehicleById);

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

function specs(v: CatalogVehicle): Array<[string, string]> {
  const rows: Array<[string, string]> = [["État", v.isNew ? "Neuf" : "Usagé"]];
  if (v.km != null) {
    rows.push([
      "Kilométrage",
      `${new Intl.NumberFormat("fr-CA").format(v.km)} km`,
    ]);
  }
  if (v.transmission) rows.push(["Transmission", TRANSMISSION_FR[v.transmission]]);
  if (v.fuelType) rows.push(["Carburant", FUEL_FR[v.fuelType]]);
  if (v.exteriorColor) rows.push(["Couleur", v.exteriorColor]);
  return rows;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const vehicle = await loadVehicle(id);
  if (!vehicle) notFound();

  const title = displayTitle(vehicle);
  return {
    title: `${title} — ${getDealerConfig().name}`,
    description: vehicle.description.slice(0, 160) || title,
    openGraph: {
      title,
      description: vehicle.description.slice(0, 200) || title,
      images: vehicle.photoUrls.slice(0, 1),
      type: "website",
    },
  };
}

export default async function VehiclePage({ params }: PageProps) {
  const { id } = await params;
  const vehicle = await loadVehicle(id);
  if (!vehicle) notFound();

  const dealer = getDealerConfig();
  const title = displayTitle(vehicle);
  const tel = telHref(dealer.contact.phone);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>

      <p className="mt-2 text-2xl font-semibold text-emerald-700">
        {displayPrice(vehicle.priceCad)}
      </p>

      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm text-gray-600">
        {specs(vehicle).map(([label, value]) => (
          <div key={label}>
            <dt className="inline font-medium">{label}&nbsp;: </dt>
            <dd className="inline">{value}</dd>
          </div>
        ))}
      </dl>

      {vehicle.photoUrls.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {vehicle.photoUrls.map((url: string, i: number) => (
            <Image
              key={url}
              src={url}
              alt={`${title} — photo ${i + 1}`}
              width={800}
              height={600}
              // The hero is above the fold and is what Meta scrapes for og:image.
              priority={i === 0}
              className="w-full rounded-lg object-cover"
              unoptimized
            />
          ))}
        </div>
      )}

      {vehicle.description && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Description</h2>
          <p className="mt-2 whitespace-pre-line text-gray-800">
            {vehicle.description}
          </p>
        </section>
      )}

      <section className="mt-8 rounded-lg border border-gray-200 p-4">
        <h2 className="text-lg font-semibold">{dealer.name}</h2>
        <address className="mt-1 not-italic text-gray-700">
          {dealer.address.addr1}
          <br />
          {dealer.address.city}, {dealer.address.region}{" "}
          {dealer.address.postalCode}
        </address>
        {tel && (
          <a
            href={tel}
            className="mt-3 inline-block rounded-md bg-gray-900 px-4 py-2 font-medium text-white"
          >
            {dealer.contact.phone}
          </a>
        )}
      </section>
    </main>
  );
}
