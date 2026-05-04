import Link from "next/link";
import AppHeader from "@/app/app-header";
import {
  fetchChannelStats,
  SOURCE_LABELS,
  type Source,
} from "@/lib/stats/channels";

export const dynamic = "force-dynamic";

const SOURCE_COLORS: Record<Source, string> = {
  direct: "bg-gray-500",
  facebook: "bg-blue-600",
  fb_marketplace: "bg-blue-800",
  instagram: "bg-pink-500",
  google: "bg-amber-500",
  lespac: "bg-orange-600",
  kijiji: "bg-red-700",
  truckpaper: "bg-sky-700",
  marketbook: "bg-cyan-700",
  wix: "bg-emerald-600",
  autre: "bg-gray-400",
};

export default async function StatsPage() {
  const s = await fetchChannelStats();
  const max7 = Math.max(1, ...s.by_source_7d.map((x) => x.count));
  const max30 = Math.max(1, ...s.by_source_30d.map((x) => x.count));
  const maxDaily = Math.max(1, ...s.daily_30d.map((d) => d.views));

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

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <section className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
          <Kpi label="Vues 7 j" value={s.views_7d} />
          <Kpi label="Vues 30 j" value={s.views_30d} />
          <Kpi label="Leads 7 j" value={s.leads_7d} highlight />
          <Kpi label="Leads 30 j" value={s.leads_30d} highlight />
          <Kpi label="Photos 30 j" value={s.photo_clicks_30d} />
          <Kpi label="Engagées 30 j" value={s.engaged_30d} />
          <Kpi label="Vidéos 30 j" value={s.video_plays_30d} />
        </section>

        <section className="bg-white border rounded p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Vues par source
          </h2>
          <div className="grid gap-6 lg:grid-cols-2">
            <SourceBars
              title="7 derniers jours"
              total={s.views_7d}
              data={s.by_source_7d}
              max={max7}
            />
            <SourceBars
              title="30 derniers jours"
              total={s.views_30d}
              data={s.by_source_30d}
              max={max30}
            />
          </div>
        </section>

        <section className="bg-white border rounded p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Vues par jour (30 j)
          </h2>
          <div className="flex items-end gap-1 h-24">
            {s.daily_30d.map((d) => (
              <div
                key={d.day}
                className="flex-1 bg-blue-500 rounded-sm hover:bg-blue-700"
                style={{ height: `${(d.views / maxDaily) * 100}%`, minHeight: "2px" }}
                title={`${d.day} — ${d.views} vue${d.views > 1 ? "s" : ""}`}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mt-1 font-mono">
            <span>{s.daily_30d[0]?.day}</span>
            <span>{s.daily_30d[s.daily_30d.length - 1]?.day}</span>
          </div>
        </section>

        <section className="bg-white border rounded p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Top 10 véhicules (30 j)
          </h2>
          {s.top_units_30d.length === 0 ? (
            <p className="text-xs text-gray-500">Aucune vue dans les 30 derniers jours.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="text-left py-1.5 pr-3">Unité</th>
                  <th className="text-right py-1.5 pr-3">Vues</th>
                  <th className="text-right py-1.5 pr-3">Photos</th>
                  <th className="text-right py-1.5 pr-3">Leads</th>
                  <th className="text-right py-1.5 pr-3">Conv.</th>
                  <th className="py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {s.top_units_30d.map((r) => {
                  const conv = r.views > 0 ? (r.leads / r.views) * 100 : 0;
                  return (
                    <tr key={r.unit} className="border-t">
                      <td className="py-1.5 pr-3 font-mono text-blue-700">
                        <Link
                          href={`/inventaire/${encodeURIComponent(r.unit)}`}
                          className="hover:underline"
                        >
                          {r.unit}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-3 text-right font-mono">{r.views}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-gray-600">
                        {r.photo_clicks}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-mono">{r.leads}</td>
                      <td className="py-1.5 pr-3 text-right font-mono text-gray-600">
                        {r.views > 0 ? `${conv.toFixed(1)} %` : "—"}
                      </td>
                      <td className="py-1.5 pl-3 text-xs text-gray-400">
                        <Link
                          href={`/vehicule/${encodeURIComponent(r.unit)}`}
                          className="hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          fiche publique ↗
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <p className="text-xs text-gray-400">
          Sources d&apos;arrivée détectées via le <code>Referer</code> HTTP. Les visiteurs
          qui désactivent le referrer (mode privé strict) tombent dans &laquo;&nbsp;Direct&nbsp;&raquo;.
          Stats Lespac/Marketplace internes (impressions, clics) à brancher plus tard sur
          les APIs respectives.
        </p>
      </div>
    </main>
  );
}

function Kpi({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "bg-white border rounded p-4 " +
        (highlight ? "border-emerald-300 bg-emerald-50" : "")
      }
    >
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div
        className={
          "text-2xl font-mono font-semibold mt-0.5 " +
          (highlight ? "text-emerald-700" : "text-gray-900")
        }
      >
        {value}
      </div>
    </div>
  );
}

function SourceBars({
  title,
  total,
  data,
  max,
}: {
  title: string;
  total: number;
  data: { source: Source; count: number }[];
  max: number;
}) {
  return (
    <div>
      <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">{title}</div>
      {data.length === 0 ? (
        <p className="text-xs text-gray-400 italic">Aucune vue.</p>
      ) : (
        <ul className="space-y-1.5">
          {data.map((d) => {
            const pct = total > 0 ? (d.count / total) * 100 : 0;
            return (
              <li key={d.source} className="flex items-center gap-2 text-xs">
                <span className="w-32 shrink-0 text-gray-700">{SOURCE_LABELS[d.source]}</span>
                <div className="flex-1 bg-gray-100 rounded h-4 relative overflow-hidden">
                  <div
                    className={"h-full " + SOURCE_COLORS[d.source]}
                    style={{ width: `${(d.count / max) * 100}%` }}
                  />
                </div>
                <span className="w-20 text-right font-mono text-gray-600">
                  {d.count} <span className="text-gray-400">({pct.toFixed(0)}%)</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
