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
      <section className="bg-white p-6 rounded shadow">
        <p className="text-sm text-gray-600">Connecté en tant que</p>
        <p className="text-lg font-medium">{user.email}</p>
      </section>
    </main>
  );
}
