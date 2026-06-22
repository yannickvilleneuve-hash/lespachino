import Link from "next/link";
import AppHeader from "@/app/app-header";

export const dynamic = "force-dynamic";

export default function StatsPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader
        title="Statistiques"
        right={
          <>
            <Link
              href="/dashboard"
              className="text-xs text-white/70 hover:text-white"
            >
              ← Dashboard
            </Link>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="text-xs text-white/70 hover:text-white"
              >
                Déconnexion
              </button>
            </form>
          </>
        }
      />
      <div className="max-w-6xl mx-auto p-6">
        <p className="text-sm text-gray-500">Stats en construction.</p>
      </div>
    </main>
  );
}
