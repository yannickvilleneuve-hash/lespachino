import Link from "next/link";
import { fetchInventory } from "@/lib/listings/queries";
import { isLespacReady } from "@/lib/lespac/config";
import AppHeader from "@/app/app-header";
import InventaireTable from "./inventaire-table";
import SyncLespacButton from "./sync-lespac-button";
import BulkPublishButton from "./bulk-publish-button";

export const dynamic = "force-dynamic";

export default async function InventairePage() {
  const rows = await fetchInventory();
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
            <BulkPublishButton />
            {lespacReady && <SyncLespacButton />}
            <Link href="/inventaire/leads" className="text-xs text-white/70 hover:text-white">
              Leads
            </Link>
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
      <InventaireTable rows={rows} />
    </main>
  );
}
