import Link from "next/link";
import { fetchInventory } from "@/lib/listings/queries";
import AppHeader from "@/app/app-header";
import InventaireTable from "./inventaire-table";

export const dynamic = "force-dynamic";

export default async function InventairePage() {
  const rows = await fetchInventory();

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
      <InventaireTable rows={rows} />
    </main>
  );
}
