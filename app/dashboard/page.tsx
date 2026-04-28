import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { fetchDashboardStats } from "@/lib/stats/dashboard";
import AppHeader from "@/app/app-header";

export const dynamic = "force-dynamic";

const currencyFmt = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const stats = await fetchDashboardStats();

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

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Inventaire */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Inventaire
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <Stat label="Véhicules actifs" value={stats.activeVehicles} hint="SERTI WGI statut A" />
            <Stat label="Publiés" value={stats.published} tone="success" />
            <Stat label="Brouillons" value={stats.drafts} tone="warn" hint="Listing créé, pas publié" />
            <Stat label="Sans listing" value={stats.withoutListing} hint="WGI actif sans ligne Supabase" />
          </div>
        </section>

        {/* Prix */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Prix publiés
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="Prix moyen" value={stats.avgPrice > 0 ? currencyFmt.format(stats.avgPrice) : "—"} />
            <Stat label="Prix max" value={stats.maxPrice > 0 ? currencyFmt.format(stats.maxPrice) : "—"} />
          </div>
        </section>

        {/* Engagement */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Engagement
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <Stat label="Vues 7j" value={stats.views7d} />
            <Stat label="Vues 30j" value={stats.views30d} />
            <Stat
              label="Leads 7j"
              value={stats.leads7d}
              tone={stats.leads7d > 0 ? "success" : undefined}
            />
            <Stat label="Leads 30j" value={stats.leads30d} />
          </div>
        </section>

        {/* Photos */}
        <section>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Médias
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="Photos total" value={stats.photosTotal} />
            <Stat
              label="Listings cachés"
              value={stats.hidden}
              tone={stats.hidden > 0 ? "warn" : undefined}
              hint="Retirés de la liste admin"
            />
          </div>
        </section>

        <nav className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <Link
            href="/inventaire"
            className="block bg-white p-5 rounded shadow hover:shadow-md transition border"
          >
            <h3 className="font-semibold mb-1">Inventaire →</h3>
            <p className="text-xs text-gray-600">Liste, édition, photos, publication.</p>
          </Link>
          <Link
            href="/inventaire/leads"
            className="block bg-white p-5 rounded shadow hover:shadow-md transition border"
          >
            <h3 className="font-semibold mb-1">Leads →</h3>
            <p className="text-xs text-gray-600">Contacts reçus via formulaires fiche.</p>
          </Link>
          <Link
            href="/dashboard/users"
            className="block bg-white p-5 rounded shadow hover:shadow-md transition border"
          >
            <h3 className="font-semibold mb-1">Utilisateurs →</h3>
            <p className="text-xs text-gray-600">Inviter ou retirer un accès.</p>
          </Link>
          <Link
            href="/dashboard/activity"
            className="block bg-white p-5 rounded shadow hover:shadow-md transition border"
          >
            <h3 className="font-semibold mb-1">Journal →</h3>
            <p className="text-xs text-gray-600">Qui a fait quoi, dernières 200 actions.</p>
          </Link>
          <Link
            href="/"
            target="_blank"
            rel="noreferrer"
            className="block bg-white p-5 rounded shadow hover:shadow-md transition border"
          >
            <h3 className="font-semibold mb-1">Catalogue public ↗</h3>
            <p className="text-xs text-gray-600">Vue client-facing.</p>
          </Link>
        </nav>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "success" | "warn";
}) {
  const color =
    tone === "success"
      ? "text-green-700"
      : tone === "warn"
        ? "text-amber-700"
        : "text-gray-900";
  return (
    <div className="bg-white p-4 rounded border">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-semibold font-mono mt-1 ${color}`}>{value}</div>
      {hint && <div className="text-[11px] text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );
}
