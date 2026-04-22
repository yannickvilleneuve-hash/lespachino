import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AppHeader from "@/app/app-header";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader
        title="Dashboard"
        right={
          <>
            <span className="text-xs text-white/70">{user.email}</span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-xs text-white/70 hover:text-white">
                Déconnexion
              </button>
            </form>
          </>
        }
      />
      <div className="p-6 max-w-5xl">
        <nav className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/inventaire"
            className="block bg-white p-6 rounded shadow hover:shadow-md transition"
          >
            <h2 className="text-lg font-semibold mb-1">Inventaire</h2>
            <p className="text-sm text-gray-600">
              Liste des véhicules actifs, édition prix / description / photos, publication multi-canal.
            </p>
          </Link>
        </nav>
      </div>
    </main>
  );
}
