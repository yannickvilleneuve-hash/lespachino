import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-semibold">Camion Hino — Interne</h1>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-sm text-gray-600 hover:underline"
          >
            Déconnexion
          </button>
        </form>
      </header>
      <section className="bg-white p-6 rounded shadow mb-6">
        <p className="text-sm text-gray-600">Connecté en tant que</p>
        <p className="text-lg font-medium">{user.email}</p>
      </section>
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
    </main>
  );
}
