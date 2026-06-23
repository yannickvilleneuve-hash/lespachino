import Link from "next/link";
import AppHeader from "@/app/app-header";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader title="Dashboard" />

      <div className="max-w-6xl mx-auto p-6">
        <nav className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
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
