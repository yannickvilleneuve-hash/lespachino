import Link from "next/link";
import AppHeader from "@/app/app-header";
import { getSyncStatus, formatAgeFr, listOnlineVehicles, type SyncStatus } from "@/lib/catalog/read";
import { findTruncatedModels, type TruncatedModel } from "@/lib/catalog/quality";
import { getWatchdogStatus, type WatchdogStatus } from "@/lib/watchdog/status";

export const dynamic = "force-dynamic";

/**
 * `null` = on n'a pas pu regarder. Comme pour la fraîcheur du snapshot, une
 * lecture ratée ne doit ni peindre en vert ni faire tomber la page.
 */
async function findSuspects(): Promise<TruncatedModel[] | null> {
  try {
    return findTruncatedModels(await listOnlineVehicles());
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const [sync, suspects, watchdog] = await Promise.all([
    getSyncStatus(),
    findSuspects(),
    getWatchdogStatus(),
  ]);

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader title="Dashboard" />

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <SyncTile status={sync} />
          <TruncatedModelsTile suspects={suspects} />
          <WatchdogTile status={watchdog} />
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

/**
 * Les modèles arrivés coupés de LesPAC.
 *
 * pacman est un miroir: il ne réécrit pas sa source, donc la réparation se fait
 * à la main sur l'annonce. Ce que la tuile apporte, c'est que le défaut se
 * découvre ici et pas dans la bouche d'un client qui a lu « TRANSIT T- » sur la
 * page d'accueil.
 */
function TruncatedModelsTile({ suspects }: { suspects: TruncatedModel[] | null }) {
  if (suspects === null) {
    return (
      <div className="p-5 rounded shadow border border-amber-300 bg-amber-50">
        <h3 className="font-semibold mb-1">Modèles tronqués</h3>
        <p className="text-xs text-gray-600">
          Impossible de lire le catalogue pour vérifier. Ce n’est pas un feu vert.
        </p>
      </div>
    );
  }

  if (suspects.length === 0) {
    return (
      <div className="p-5 rounded shadow border border-emerald-300 bg-emerald-50">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold">Modèles tronqués</h3>
          <span className="shrink-0 rounded px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800">
            Aucun
          </span>
        </div>
        <p className="text-sm text-gray-800">Tous les modèles du catalogue ont l’air complets.</p>
      </div>
    );
  }

  return (
    <div className="p-5 rounded shadow border border-red-300 bg-red-50">
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="font-semibold">Modèles tronqués</h3>
        <span className="shrink-0 rounded px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-800">
          {suspects.length} annonce{suspects.length > 1 ? "s" : ""}
        </span>
      </div>

      <p className="text-xs text-gray-700">
        À corriger <strong>sur LesPAC</strong> (titre + champ « Modèle »). Le site et les feeds
        suivront au prochain cycle.
      </p>

      <ul className="mt-2 space-y-1">
        {suspects.map((s) => (
          <li key={s.id} className="rounded border border-red-200 bg-white px-2 py-1 text-xs">
            <Link
              href={`/vehicule/${s.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono font-semibold text-red-800 hover:underline"
            >
              {s.id}
            </Link>{" "}
            <span className="text-gray-800">{s.title}</span>
            <span className="block text-gray-500">
              modèle « {s.model} » — {s.reason}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const WATCHDOG_TONE = {
  ok: { card: "border-emerald-300 bg-emerald-50", chip: "bg-emerald-100 text-emerald-800", label: "En veille" },
  alerte: { card: "border-red-300 bg-red-50", chip: "bg-red-100 text-red-800", label: "Alerte" },
  muet: { card: "border-red-300 bg-red-50", chip: "bg-red-100 text-red-800", label: "Muet" },
  inconnu: { card: "border-amber-300 bg-amber-50", chip: "bg-amber-100 text-amber-800", label: "Jamais passé" },
} as const;

/**
 * Le chien de garde vit hors de cette machine (Edge Function Supabase, aux 15
 * min). Cette tuile surveille le surveillant: sans elle, un chien de garde
 * arrêté remplacerait une panne muette par une autre, en plus silencieuse.
 */
function WatchdogTile({ status }: { status: WatchdogStatus }) {
  const tone = WATCHDOG_TONE[status.health];
  return (
    <div className={`p-5 rounded shadow border ${tone.card}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="font-semibold">Surveillance externe</h3>
        <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${tone.chip}`}>
          {tone.label}
        </span>
      </div>

      {status.health === "inconnu" ? (
        <p className="text-xs text-gray-600">
          Aucun passage enregistré. Vérifier la tâche <code className="font-mono">pipeline-watchdog</code>.
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-800">
            Dernier passage {formatAgeFr(status.ageSec)} · verdict{" "}
            <span className="font-mono font-semibold">{status.verdict}</span>
          </p>
          {status.health === "muet" && (
            <p className="mt-2 text-xs text-red-800">
              Le chien de garde lui-même ne répond plus: plus rien ne vous préviendra d’une panne.
            </p>
          )}
          {status.detail && status.verdict !== "OK" && (
            <p className="mt-2 rounded border border-red-200 bg-white px-2 py-1 text-xs text-red-800">
              {status.detail}
            </p>
          )}
        </>
      )}
    </div>
  );
}
