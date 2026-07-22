import type { Metadata } from "next";
import { Oswald } from "next/font/google";
import { listOnlineVehicles, type SnapshotVehicle } from "@/lib/catalog/read";
import { pickCarouselVehicles } from "@/lib/catalog/carousel";
import { getDealerConfig, telHref } from "@/lib/dealer/config";
import { CarouselCard } from "./CarouselCard";
import { CarouselTrack } from "./CarouselTrack";

export const revalidate = 300;

const oswald = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"] });

/** Where "voir tout" goes. The WordPress page, not our own /vehicule: the
 *  visitor is inside camion-hino.ca and should stay there. */
const INVENTORY_URL = process.env.SITE_INVENTORY_URL ?? "https://camion-hino.ca/inventaire";

export const metadata: Metadata = {
  title: "Camions en stock — Centre du camion Hino",
  // A fragment meant to be framed inside the accueil. Indexing it would put a
  // headerless strip in the results next to the real inventory page.
  robots: { index: false, follow: true },
};

/**
 * Shown when the snapshot cannot be read, and when it holds nothing visible.
 *
 * Same height as the strip, on purpose: this block sits framed in the middle of
 * the home page, so the alternative to content is a 380 px hole — or worse, an
 * error page boxed inside the accueil.
 */
function Fallback({ phone, tel }: { phone: string | null; tel: string | null }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm text-white/70">
        Notre inventaire change vite. Appelez-nous pour savoir ce qui est disponible aujourd&apos;hui.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {phone && (
          <a
            href={tel ?? undefined}
            className="bg-[#ed1c24] px-5 py-2 text-sm font-bold uppercase tracking-widest text-white transition hover:bg-[#c81820]"
          >
            {phone}
          </a>
        )}
        <a
          href={INVENTORY_URL}
          target="_top"
          className="border border-white/30 px-5 py-2 text-sm font-semibold uppercase tracking-widest text-white/80 transition hover:border-white hover:text-white"
        >
          Voir l&apos;inventaire
        </a>
      </div>
    </div>
  );
}

export default async function CarouselPage() {
  const dealer = getDealerConfig();
  const tel = telHref(dealer.contact.phone);

  let rows: SnapshotVehicle[] = [];
  try {
    rows = pickCarouselVehicles(await listOnlineVehicles());
  } catch (err) {
    // Never a 500: this renders inside the accueil, where a Next error page
    // would be framed in the middle of the dealer's home page.
    console.error("[carrousel] snapshot read failed, serving the fallback:", err);
  }

  return (
    <main className={`${oswald.className} h-[380px] overflow-hidden bg-[#0e0e0f] text-white`}>
      {rows.length === 0 ? (
        <Fallback phone={dealer.contact.phone} tel={tel} />
      ) : (
        <CarouselTrack>
          {rows.map((row) => (
            <CarouselCard key={row.vehicle.id} row={row} />
          ))}
          <li className="w-[260px] shrink-0 snap-start">
            <a
              href={INVENTORY_URL}
              target="_top"
              className="flex h-[340px] flex-col items-center justify-center gap-3 border border-white/15 bg-[#141416] px-6 text-center transition hover:border-[#ed1c24] hover:bg-[#1a1a1d]"
            >
              <span className="text-lg font-bold uppercase leading-tight tracking-tight text-white">
                Voir tout l&apos;inventaire
              </span>
              <span className="text-sm text-white/50">
                Tous les camions disponibles, avec photos et prix
              </span>
              <span aria-hidden className="text-2xl text-[#ed1c24]">
                →
              </span>
            </a>
          </li>
        </CarouselTrack>
      )}
    </main>
  );
}
