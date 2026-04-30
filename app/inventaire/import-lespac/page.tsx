import Link from "next/link";
import AppHeader from "@/app/app-header";
import { getLespacImportContext } from "./actions";
import ImportTable from "./import-table";

export const dynamic = "force-dynamic";

export default async function ImportLespacPage() {
  const ctx = await getLespacImportContext();

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader
        title="Importer depuis Lespac"
        right={
          <>
            <span className="text-xs text-white/70">{ctx.rows.length} annonce{ctx.rows.length > 1 ? "s" : ""} manuelle{ctx.rows.length > 1 ? "s" : ""}</span>
            <Link href="/inventaire" className="text-xs text-white/70 hover:text-white">
              ← Inventaire
            </Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-xs text-white/70 hover:text-white">
                Déconnexion
              </button>
            </form>
          </>
        }
      />
      <ImportTable rows={ctx.rows} candidates={ctx.candidates} />
    </main>
  );
}
