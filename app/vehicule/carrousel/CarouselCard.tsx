import Image from "next/image";
import { photoSrc, type SnapshotVehicle } from "@/lib/catalog/read";
import { displayPrice, displayTitle } from "../format";

/**
 * One truck in the home-page strip.
 *
 * Fixed width, and a height that never depends on the text: the strip lives in
 * a WordPress iframe of fixed height, so a card that grows would be clipped
 * rather than pushing the frame open. Hence the clamped title.
 */
export function CarouselCard({ row }: { row: SnapshotVehicle }) {
  const v = row.vehicle;
  const hero = row.photos[0];
  const title = displayTitle(v);

  return (
    <li className="w-[260px] shrink-0 snap-start">
      {/* New tab: the strip is framed inside the accueil, and the vehicle page
          carries the lead form — it must run full page. */}
      <a
        href={`/vehicule/${v.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="group block h-[340px] overflow-hidden bg-[#141416] transition hover:bg-[#1a1a1d]"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-black">
          {hero && (
            <Image
              src={photoSrc(hero)}
              alt={title}
              fill
              sizes="260px"
              className="object-cover transition duration-300 group-hover:scale-[1.03]"
            />
          )}
          <span className="absolute left-0 top-0 bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-white/70">
            {v.isNew ? "Neuf" : "Usagé"}
          </span>
        </div>
        <div className="p-3">
          <h2 className="line-clamp-2 h-[42px] text-sm font-bold uppercase leading-tight tracking-tight text-white">
            {title}
          </h2>
          <p className="mt-2">
            <span className="inline-block bg-[#ed1c24] px-2.5 py-1 text-base font-bold tracking-tight text-white">
              {displayPrice(v.priceCad)}
            </span>
          </p>
        </div>
      </a>
    </li>
  );
}
