import type { Metadata } from "next";
import { Oswald } from "next/font/google";
import { listOnlineVehicles } from "@/lib/catalog/read";
import { getDealerConfig, telHref } from "@/lib/dealer/config";
import { VehicleCard } from "./VehicleCard";
import { FrameHeightReporter } from "./FrameHeightReporter";

export const revalidate = 300;

const oswald = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "Inventaire — Centre du camion Hino",
  description: "Camions et véhicules commerciaux disponibles chez Centre du camion Hino, Chicoutimi.",
};

export default async function InventoryPage() {
  const rows = await listOnlineVehicles();
  const dealer = getDealerConfig();
  const tel = telHref(dealer.contact.phone);

  return (
    <main className={`${oswald.className} min-h-screen bg-[#0e0e0f] text-white`}>
      <FrameHeightReporter />

      <header className="flex items-center justify-between border-b border-white/10 px-5 py-3 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="block h-6 w-6 bg-[#ed1c24]" aria-hidden />
          <span className="text-sm font-bold uppercase leading-none tracking-widest sm:text-base">
            Inventaire
            <span className="block text-[10px] font-medium tracking-[0.35em] text-white/50">
              {rows.length} véhicule{rows.length > 1 ? "s" : ""}
            </span>
          </span>
        </div>
        {dealer.contact.phone && (
          <a
            href={tel ?? undefined}
            className="text-sm font-semibold tracking-wide text-white/80 transition hover:text-white sm:text-base"
          >
            {dealer.contact.phone}
          </a>
        )}
      </header>

      {rows.length === 0 ? (
        <p className="px-5 py-16 text-center text-sm text-white/50">
          Aucun véhicule disponible pour le moment. Appelez-nous, l&apos;inventaire change vite.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <VehicleCard key={row.vehicle.id} row={row} />
          ))}
        </ul>
      )}
    </main>
  );
}
