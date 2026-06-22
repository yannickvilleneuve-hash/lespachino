import Link from "next/link";
import { fetchInventory } from "@/lib/listings/queries";
import { fetchInventoryAlerts } from "@/lib/stats/alerts";
import { isLespacReady } from "@/lib/lespac/config";
import AppHeader from "@/app/app-header";
import InventaireTable from "./inventaire-table";
import SyncLespacButton from "./sync-lespac-button";
export const dynamic = "force-dynamic";

export default async function InventairePage() {
  const [rows, alerts] = await Promise.all([fetchInventory(), fetchInventoryAlerts()]);
  const lespacReady = isLespacReady();

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader
        title="Inventaire"
        right={
          <>
            <span className="text-xs text-white/70">
              {rows.length} véhicule{rows.length > 1 ? "s" : ""} actif{rows.length > 1 ? "s" : ""}
            </span>
            <Link href="/dashboard" className="text-xs text-white/70 hover:text-white">
              Dashboard
            </Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-xs text-white/70 hover:text-white">
                Déconnexion
              </button>
            </form>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2 border-b bg-white px-6 py-2">
        <ActionLink href="/inventaire/scan-vin">Scanner VIN</ActionLink>
        {lespacReady && <SyncLespacButton />}
        <ActionLink href="/dashboard/destinations">Destinations</ActionLink>
        {lespacReady && <ActionLink href="/inventaire/import-lespac">Import Lespac</ActionLink>}
        <ActionLink href="/dashboard/demand">Demande</ActionLink>
      </div>
      <InventaireTable rows={rows} alerts={alerts} />
    </main>
  );
}

function ActionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-800"
    >
      {children}
    </Link>
  );
}
