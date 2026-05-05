import Link from "next/link";
import AppHeader from "@/app/app-header";
import { fetchMetaDiagnostics, type MetaUploadIssue } from "@/lib/meta/diagnostics";
import MetaActions from "./meta-actions";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("fr-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFmt.format(date);
}

export default async function MetaDashboardPage() {
  const diagnostics = await fetchMetaDiagnostics();

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader
        title="Meta"
        right={
          <Link href="/dashboard" className="text-xs text-white/70 hover:text-white">
            ← Dashboard
          </Link>
        }
      />

      <div className="mx-auto max-w-6xl p-6 space-y-6">
        {!diagnostics.ok ? (
          <section className="rounded border bg-white p-5">
            <h2 className="text-lg font-semibold text-red-700">Connexion Meta indisponible</h2>
            {diagnostics.missing.length > 0 && (
              <p className="mt-2 text-sm text-gray-700">
                Variables manquantes: {diagnostics.missing.join(", ")}
              </p>
            )}
            {diagnostics.error && (
              <p className="mt-2 text-sm text-red-700">{diagnostics.error}</p>
            )}
          </section>
        ) : (
          <>
            <section className="grid gap-3 md:grid-cols-4">
              <Stat label="Catalogue Meta" value={diagnostics.catalog?.name ?? "-"} />
              <Stat label="Produits Meta" value={diagnostics.catalog?.product_count ?? 0} />
              <Stat label="Feed Meta" value={diagnostics.feed?.product_count ?? 0} />
              <Stat
                label="Prêts dans le CSV"
                value={diagnostics.eligibility.facebook_feed_ready_count}
                tone={
                  diagnostics.eligibility.facebook_feed_ready_count > 0 ? "success" : "warn"
                }
              />
            </section>

            <section className="rounded border bg-white p-4">
              <MetaActions canImport={diagnostics.eligibility.facebook_feed_ready_count > 0} />
            </section>

            <section className="rounded border bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Import planifié</h2>
                  <p className="mt-1 break-all text-sm text-gray-600">
                    {diagnostics.feed_url ?? "-"}
                  </p>
                </div>
                <a
                  href="/feed/facebook.csv"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded bg-blue-700 px-3 py-2 text-sm text-white hover:bg-blue-800"
                >
                  Ouvrir CSV
                </a>
              </div>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <Pair label="Nom" value={diagnostics.feed?.name ?? "-"} />
                <Pair label="Devise" value={diagnostics.feed?.default_currency ?? "-"} />
                <Pair
                  label="Fréquence"
                  value={
                    diagnostics.feed?.schedule
                      ? `${diagnostics.feed.schedule.interval ?? "-"} ${diagnostics.feed.schedule.interval_count ?? ""}`.trim()
                      : "-"
                  }
                />
                <Pair
                  label="Prochaine fenêtre"
                  value={
                    diagnostics.feed?.schedule
                      ? `${String(diagnostics.feed.schedule.hour ?? "").padStart(2, "0")}:${String(diagnostics.feed.schedule.minute ?? "").padStart(2, "0")} ${diagnostics.feed.schedule.timezone ?? ""}`.trim()
                      : "-"
                  }
                />
              </dl>
            </section>

            <section className="rounded border bg-white p-5">
              <h2 className="text-lg font-semibold">Dernier import Meta</h2>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <Pair label="Début" value={formatDate(diagnostics.latest_upload?.start_time)} />
                <Pair label="Fin" value={formatDate(diagnostics.latest_upload?.end_time)} />
                <Pair
                  label="Items détectés"
                  value={String(diagnostics.latest_upload?.num_detected_items ?? 0)}
                />
                <Pair
                  label="Items persistés"
                  value={String(diagnostics.latest_upload?.num_persisted_items ?? 0)}
                />
                <Pair
                  label="Erreurs"
                  value={String(diagnostics.latest_upload?.error_count ?? 0)}
                  tone={(diagnostics.latest_upload?.error_count ?? 0) > 0 ? "bad" : undefined}
                />
                <Pair
                  label="Avertissements"
                  value={String(diagnostics.latest_upload?.warning_count ?? 0)}
                  tone={(diagnostics.latest_upload?.warning_count ?? 0) > 0 ? "warn" : undefined}
                />
              </dl>
              <IssueList
                title="Erreurs Meta"
                issues={diagnostics.latest_upload?.errors?.data ?? []}
              />
              <IssueList
                title="Avertissements Meta"
                issues={diagnostics.latest_upload?.warnings?.data ?? []}
              />
            </section>

            <section className="rounded border bg-white p-5">
              <h2 className="text-lg font-semibold">Ce que notre app envoie à Meta</h2>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <Pair
                  label="Fiches publiques"
                  value={String(diagnostics.eligibility.native_count)}
                />
                <Pair
                  label="Sélection Facebook"
                  value={String(diagnostics.eligibility.facebook_selected_count)}
                  tone={
                    diagnostics.eligibility.facebook_selected_count > 0 ? undefined : "warn"
                  }
                />
                <Pair
                  label="Avec prix + photo"
                  value={String(diagnostics.eligibility.facebook_feed_ready_count)}
                  tone={
                    diagnostics.eligibility.facebook_feed_ready_count > 0 ? "good" : "warn"
                  }
                />
                <Pair
                  label="Prêts à ajouter"
                  value={String(diagnostics.eligibility.facebook_ready_available_count)}
                  tone={
                    diagnostics.eligibility.facebook_ready_available_count > 0 ? "good" : "warn"
                  }
                />
                <Pair
                  label="Catalogue Meta"
                  value={diagnostics.catalog?.vertical ?? "-"}
                />
              </dl>
              <MissingList
                label="Sélectionnés sans prix"
                units={diagnostics.eligibility.selected_missing_price}
              />
              <MissingList
                label="Sélectionnés sans photo principale"
                units={diagnostics.eligibility.selected_missing_photo}
              />
              {diagnostics.eligibility.facebook_selected_count === 0 && (
                <p className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Aucun véhicule n&apos;est sélectionné pour Facebook Marketplace. Le CSV Meta est
                  donc vide et Meta rejette le dernier import. Ouvre une fiche véhicule et utilise
                  le bouton Publier dans la ligne Facebook Marketplace pour l&apos;ajouter au feed.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "success" | "warn";
}) {
  const color = tone === "success" ? "text-green-700" : tone === "warn" ? "text-amber-700" : "text-gray-900";
  return (
    <div className="rounded border bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 truncate font-mono text-2xl font-semibold ${color}`}>
        {value}
      </div>
    </div>
  );
}

function Pair({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad";
}) {
  const color =
    tone === "good"
      ? "text-green-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "bad"
          ? "text-red-700"
          : "text-gray-900";
  return (
    <div className="rounded border bg-gray-50 p-3">
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className={`mt-0.5 break-words font-mono text-sm font-semibold ${color}`}>{value}</dd>
    </div>
  );
}

function IssueList({ title, issues }: { title: string; issues: MetaUploadIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      <ul className="mt-2 space-y-2">
        {issues.map((issue, index) => (
          <li key={issue.id ?? index} className="rounded border border-red-200 bg-red-50 p-3">
            <div className="text-sm font-semibold text-red-800">
              {issue.summary ?? issue.severity ?? "Erreur"}
            </div>
            {issue.description && (
              <p className="mt-1 text-sm text-red-700">{issue.description}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MissingList({ label, units }: { label: string; units: string[] }) {
  if (units.length === 0) return null;
  return (
    <p className="mt-3 text-sm text-amber-800">
      {label}: <span className="font-mono">{units.join(", ")}</span>
    </p>
  );
}
