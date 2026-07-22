import Image from "next/image";
import Link from "next/link";
import { photoSrc, type SnapshotVehicle } from "@/lib/catalog/read";
import { hasPlausibleOdometer } from "@/lib/feeds/eligibility";
import { displayPrice, displayTitle } from "./format";

export function VehicleCard({ row }: { row: SnapshotVehicle }) {
  const v = row.vehicle;
  const hero = row.photos[0];
  const title = displayTitle(v);

  return (
    <li className="group overflow-hidden bg-[#141416] transition hover:bg-[#1a1a1d]">
      {/* New tab: the index is embedded in an iframe on camion-hino.ca, and the
          lead form must run full-page, not boxed inside it. */}
      <Link href={`/vehicule/${v.id}`} target="_blank" rel="noopener noreferrer">
        <div className="relative aspect-[4/3] overflow-hidden bg-black">
          {hero && (
            <Image
              src={photoSrc(hero)}
              alt={title}
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          )}
          <span className="absolute left-0 top-0 bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/70">
            {v.isNew ? "Neuf" : "Usagé"}
          </span>
        </div>
        <div className="p-4">
          <h2 className="text-lg font-bold uppercase leading-tight tracking-tight text-white">
            {title}
          </h2>
          <p className="mt-2">
            <span className="inline-block bg-[#ed1c24] px-3 py-1 text-lg font-bold tracking-tight text-white">
              {displayPrice(v.priceCad)}
            </span>
          </p>
          {/* Same bar as the feeds: a used truck showing 0 or 10 km has a
              placeholder odometer, not a real one. Printing it reads as fraud
              to a buyer, so say nothing rather than say something false. */}
          {hasPlausibleOdometer(v) && (
            <p className="mt-2 text-sm text-white/50">
              {new Intl.NumberFormat("fr-CA").format(v.km!)} km
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}
