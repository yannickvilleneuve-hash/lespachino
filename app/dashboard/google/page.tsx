import Link from "next/link";
import AppHeader from "@/app/app-header";
import { fetchGoogleVlaDiagnostics } from "@/lib/google/diagnostics";
import GoogleActions from "./google-actions";

export const dynamic = "force-dynamic";

export default async function GoogleDashboardPage() {
  const diagnostics = await fetchGoogleVlaDiagnostics();

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader
        title="Google Vehicle Ads"
        right={
          <Link href="/dashboard" className="text-xs text-white/70 hover:text-white">
            ← Dashboard
          </Link>
        }
      />

      <div className="mx-auto max-w-6xl p-6 space-y-6">
        <section className="grid gap-3 md:grid-cols-4">
          <Stat label="Feed configuré" value={diagnostics.configured ? "Oui" : "Non"} tone={diagnostics.configured ? "success" : "warn"} />
          <Stat label="Fiches publiques" value={diagnostics.native_count} />
          <Stat label="Sélection Google" value={diagnostics.google_selected_count} />
          <Stat label="Prêts dans le XML" value={diagnostics.google_feed_ready_count} tone={diagnostics.google_feed_ready_count > 0 ? "success" : "warn"} />
        </section>

        <section className="rounded border bg-white p-4">
          <GoogleActions
            configured={diagnostics.configured}
            canImport={diagnostics.google_feed_ready_count > 0}
          />
        </section>

        <section className="rounded border bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Feed XML</h2>
              <p className="mt-1 break-all text-sm text-gray-600">{diagnostics.feed_url}</p>
            </div>
            <a
              href="/feed/vehicles.xml"
              target="_blank"
              rel="noreferrer"
              className="rounded bg-blue-700 px-3 py-2 text-sm text-white hover:bg-blue-800"
            >
              Ouvrir XML
            </a>
          </div>

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Pair label="Merchant ID" value={diagnostics.merchant_id ?? "-"} />
            <Pair label="Datafeed ID" value={diagnostics.datafeed_id ?? "-"} />
            <Pair
              label="Prêts à ajouter"
              value={String(diagnostics.google_ready_available_count)}
              tone={diagnostics.google_ready_available_count > 0 ? "good" : "warn"}
            />
            <Pair
              label="Avec prix + photo"
              value={String(diagnostics.google_feed_ready_count)}
              tone={diagnostics.google_feed_ready_count > 0 ? "good" : "warn"}
            />
          </dl>
          <MissingList label="Sélectionnés sans prix" units={diagnostics.selected_missing_price} />
          <MissingList
            label="Sélectionnés sans photo principale"
            units={diagnostics.selected_missing_photo}
          />
          {diagnostics.google_selected_count === 0 && (
            <p className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Aucun véhicule n&apos;est sélectionné pour Google Vehicle Ads. Le XML Google est donc
              vide. Utilise le bouton ci-dessus pour ajouter les véhicules prêts.
            </p>
          )}
          {!diagnostics.configured && (
            <p className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              L&apos;import forcé Google n&apos;est pas configuré. Les variables
              GOOGLE_MERCHANT_ID, GOOGLE_DATAFEED_ID et GOOGLE_SERVICE_ACCOUNT_KEY sont requises.
            </p>
          )}
        </section>
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
  tone?: "good" | "warn";
}) {
  const color = tone === "good" ? "text-green-700" : tone === "warn" ? "text-amber-700" : "text-gray-900";
  return (
    <div className="rounded border bg-gray-50 p-3">
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className={`mt-0.5 break-words font-mono text-sm font-semibold ${color}`}>{value}</dd>
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
