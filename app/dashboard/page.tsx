import Link from "next/link";
import AppHeader from "@/app/app-header";
import { getSyncStatus, formatAgeFr, type SyncStatus } from "@/lib/catalog/read";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const sync = await getSyncStatus();

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader title="Dashboard" />

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <SyncTile status={sync} />
        </section>

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

/**
 * Each tone carries its own background: `bg-white bg-emerald-50` on one element
 * is a coin flip, and the coin lands on white — Tailwind emits `.bg-white`
 * after `.bg-emerald-50`, so the tint loses no matter the class order here.
 */
const TONE = {
  fresh: {
    card: "border-emerald-300 bg-emerald-50",
    chip: "bg-emerald-100 text-emerald-800",
    label: "À jour",
  },
  stale: {
    card: "border-red-300 bg-red-50",
    chip: "bg-red-100 text-red-800",
    label: "En retard",
  },
  failing: {
    card: "border-red-300 bg-red-50",
    chip: "bg-red-100 text-red-800",
    label: "En échec",
  },
  unknown: {
    card: "border-amber-300 bg-amber-50",
    chip: "bg-amber-100 text-amber-800",
    label: "État inconnu",
  },
} as const;

/**
 * The snapshot's own health. Without it a dead worker is invisible: the site
 * keeps serving the frozen inventory it already has, and the first sign of
 * trouble is a customer calling about a truck sold three weeks ago.
 */
function SyncTile({ status }: { status: SyncStatus }) {
  const tone = TONE[status.health];
  const minutes = Math.round(status.thresholdSec / 60);

  return (
    <div className={`p-5 rounded shadow border ${tone.card}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="font-semibold">Synchronisation du catalogue</h3>
        <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${tone.chip}`}>
          {tone.label}
        </span>
      </div>

      {status.health === "unknown" ? (
        <p className="text-xs text-gray-600">
          Impossible de lire l’état de la synchronisation. Vérifier le worker{" "}
          <code className="font-mono">pacman-catalog-sync</code> et la base.
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-800">
            Dernière synchro {formatAgeFr(status.ageSec)}
            {status.count !== null && (
              <>
                {" · "}
                <span className="font-semibold">{status.count}</span>{" "}
                {/* En français, zéro prend le singulier: « 0 véhicule écrit ». */}
                {Math.abs(status.count ?? 0) < 2 ? "véhicule écrit" : "véhicules écrits"}
              </>
            )}
          </p>
          {status.ranAt && (
            <p className="mt-0.5 text-xs text-gray-500 font-mono">
              {new Intl.DateTimeFormat("fr-CA", {
                dateStyle: "short",
                timeStyle: "medium",
              }).format(new Date(status.ranAt))}
            </p>
          )}
        </>
      )}

      {status.error && (
        <p className="mt-2 rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-800 break-words">
          {status.error}
        </p>
      )}

      {status.health === "stale" && (
        <p className="mt-2 text-xs text-red-800">
          Aucune synchro depuis plus de {minutes} minutes — le catalogue affiché est figé.
        </p>
      )}
    </div>
  );
}
