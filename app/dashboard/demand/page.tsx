import Link from "next/link";
import AppHeader from "@/app/app-header";
import { fetchDemandInsights } from "@/lib/stats/demand";

export const dynamic = "force-dynamic";

const currencyFmt = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

export default async function DemandPage() {
  const insights = await fetchDemandInsights();

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader
        title="Demande"
        right={
          <Link href="/dashboard" className="text-xs text-white/70 hover:text-white">
            ← Dashboard
          </Link>
        }
      />

      <div className="mx-auto max-w-6xl p-6 space-y-6">
        <section className="bg-white border rounded p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Modèles qui attirent
          </h2>
          {insights.segments.length === 0 ? (
            <p className="text-sm text-gray-500">Pas encore assez de données sur 30 jours.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="text-left py-1.5 pr-3">Segment</th>
                  <th className="text-right py-1.5 pr-3">Unités</th>
                  <th className="text-right py-1.5 pr-3">Vues</th>
                  <th className="text-right py-1.5 pr-3">Leads</th>
                  <th className="text-right py-1.5 pr-3">Score</th>
                </tr>
              </thead>
              <tbody>
                {insights.segments.map((segment) => (
                  <tr key={segment.key} className="border-t">
                    <td className="py-1.5 pr-3 font-medium">{segment.label}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{segment.units}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{segment.views}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{segment.leads}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{segment.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="bg-white border rounded p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            À prioriser
          </h2>
          {insights.opportunities.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune action évidente.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="text-left py-1.5 pr-3">Unité</th>
                  <th className="text-left py-1.5 pr-3">Véhicule</th>
                  <th className="text-right py-1.5 pr-3">Prix</th>
                  <th className="text-right py-1.5 pr-3">Vues</th>
                  <th className="text-right py-1.5 pr-3">Leads</th>
                  <th className="text-left py-1.5 pr-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {insights.opportunities.map((item) => (
                  <tr key={item.unit} className="border-t">
                    <td className="py-1.5 pr-3 font-mono text-blue-700">
                      <Link href={`/inventaire/${encodeURIComponent(item.unit)}`} className="hover:underline">
                        {item.unit}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3">{item.label}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">
                      {item.price_cad > 0 ? currencyFmt.format(item.price_cad) : "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono">{item.views}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{item.leads}</td>
                    <td className="py-1.5 pr-3">{item.recommendation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}
