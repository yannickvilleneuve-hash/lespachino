import Link from "next/link";
import AppHeader from "@/app/app-header";
import { requireAllowedUser } from "@/lib/auth/require-user";
import { fetchBotDashboard } from "@/lib/bot/dashboard-queries";
import { getBotConfig } from "@/lib/bot/config";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Platform } from "@/lib/bot/types";
import BotControls from "./bot-controls";

export const dynamic = "force-dynamic";

const priceFmt = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

export default async function BotDashboardPage() {
  const email = await requireAllowedUser();
  const supabase = createAdminClient();
  const [cfg, data] = await Promise.all([
    getBotConfig(supabase),
    fetchBotDashboard(supabase),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <AppHeader
        title="Bot LesPAC"
        right={
          <Link
            href="/dashboard"
            className="text-xs text-white/70 hover:text-white"
          >
            ← Tableau de bord
          </Link>
        }
      />

      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
        {/* 1. Session health banner */}
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-medium text-slate-500">Sessions</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.sessions.map((s) => (
              <span
                key={s.platform}
                className={
                  "rounded-md px-3 py-1 text-sm font-semibold " +
                  (s.health === "healthy"
                    ? "bg-emerald-100 text-emerald-800"
                    : s.health === "needs_reauth"
                      ? "bg-red-100 text-red-800"
                      : "bg-slate-100 text-slate-600")
                }
              >
                {s.platform}{" "}
                {s.health === "healthy"
                  ? "✓"
                  : s.health === "needs_reauth"
                    ? "✗ ré-auth"
                    : "?"}
              </span>
            ))}
          </div>
        </section>

        {/* 2. Needs your attention */}
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">À régler</h2>
          {data.attention.length === 0 ? (
            <p className="mt-2 text-sm text-emerald-700">Rien à signaler.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {data.attention.map((a, i) => (
                <li
                  key={`${a.kind}-${a.platform}-${a.lespacId ?? i}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                >
                  <span>{a.message}</span>
                  {a.screenshotUrl && (
                    <a
                      href={a.screenshotUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded border border-amber-300 bg-white px-2 py-1 text-xs font-medium hover:bg-amber-100"
                    >
                      Capture
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 3. Listings board */}
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">Annonces</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Annonce</th>
                  <th className="py-2 pr-3">Prix</th>
                  {cfg.enabledPlatforms.map((p) => (
                    <th key={p} className="py-2 pr-3">
                      {p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.board.map((row) => (
                  <tr key={row.lespacId} className="border-t border-slate-100">
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        {row.thumbnailUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.thumbnailUrl}
                            alt=""
                            className="h-10 w-14 rounded object-cover"
                          />
                        )}
                        <span className="font-medium text-slate-900">
                          {row.title}
                        </span>
                        {row.status === "gone" && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                            vendu
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-3 font-mono text-slate-700">
                      {row.priceCad ? priceFmt.format(row.priceCad) : "—"}
                    </td>
                    {cfg.enabledPlatforms.map((p) => (
                      <td key={p} className="py-2 pr-3">
                        <StatusChip cell={row.platforms[p as Platform]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 4. Recent activity */}
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">
            Activité récente
          </h2>
          <ul className="mt-3 space-y-1 text-sm text-slate-600">
            {data.activity.map((e, i) => (
              <li key={`${e.ts}-${i}`} className="flex gap-2">
                <span className="font-mono text-xs text-slate-400">
                  {new Intl.DateTimeFormat("fr-CA", {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(e.ts))}
                </span>
                <span>
                  {e.platform ?? "—"} · {e.action} · {e.outcome}
                  {e.lespacId ? ` · ${e.lespacId}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* 5. Footer controls */}
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <BotControls
            lastSyncAt={data.lastSyncAt}
            nextSyncAt={data.nextSyncAt}
            platforms={cfg.enabledPlatforms}
          />
        </section>

        <p className="px-1 text-xs text-slate-400">Connecté : {email}</p>
      </div>
    </main>
  );
}

function StatusChip({
  cell,
}: {
  cell: { status: string; url: string | null } | null;
}) {
  if (!cell) return <span className="text-xs text-slate-400">—</span>;
  const tone =
    cell.status === "live"
      ? "bg-emerald-100 text-emerald-800"
      : cell.status === "failed"
        ? "bg-red-100 text-red-800"
        : cell.status === "removed"
          ? "bg-slate-100 text-slate-500"
          : "bg-amber-100 text-amber-800";
  const chip = (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {cell.status}
    </span>
  );
  return cell.url ? (
    <a href={cell.url} target="_blank" rel="noreferrer" className="hover:underline">
      {chip}
    </a>
  ) : (
    chip
  );
}
