import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AppHeader from "@/app/app-header";

export const dynamic = "force-dynamic";

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

      <div className="max-w-6xl mx-auto p-6">
        <nav className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <Link
            href="/dashboard/users"
            className="block bg-white p-5 rounded shadow hover:shadow-md transition border"
          >
            <h3 className="font-semibold mb-1">Utilisateurs →</h3>
            <p className="text-xs text-gray-600">Inviter ou retirer un accès.</p>
          </Link>
          <Link
            href="/dashboard/bot"
            className="block bg-white p-5 rounded shadow hover:shadow-md transition border"
          >
            <h3 className="font-semibold mb-1">Bot Mirror LesPAC →</h3>
            <p className="text-xs text-gray-600">Synchronisation, sessions et annonces miroir.</p>
          </Link>
        </nav>
      </div>
    </main>
  );
}
