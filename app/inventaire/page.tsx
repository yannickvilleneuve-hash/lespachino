import Link from "next/link";
import { fetchInventory } from "@/lib/listings/queries";
import InventaireTable from "./inventaire-table";

export const dynamic = "force-dynamic";

export default async function InventairePage() {
  const rows = await fetchInventory();

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:underline">
            ← Dashboard
          </Link>
          <h1 className="text-xl font-semibold">Inventaire</h1>
          <span className="text-sm text-gray-500">{rows.length} véhicule{rows.length > 1 ? "s" : ""} actif{rows.length > 1 ? "s" : ""}</span>
        </div>
      </header>
      <InventaireTable rows={rows} />
    </main>
  );
}
