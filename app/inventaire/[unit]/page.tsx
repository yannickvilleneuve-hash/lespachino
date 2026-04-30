import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchVehicleByUnit } from "@/lib/listings/queries";
import { withSignedUrls } from "@/lib/listings/photos";
import { CHANNELS, type Channel } from "@/lib/listings/schema";
import { CHANNEL_LABELS, type Channel as LiveChannel } from "@/lib/listings/channel-state";
import AppHeader from "@/app/app-header";
import { StatusBadge } from "../status-badges";
import ListingForm from "./listing-form";
import PhotoManager from "./photo-manager";

export const dynamic = "force-dynamic";

const currencyFmt = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 2,
});

export default async function EditPage({
  params,
}: {
  params: Promise<{ unit: string }>;
}) {
  const { unit } = await params;
  const detail = await fetchVehicleByUnit(decodeURIComponent(unit));
  if (!detail) notFound();
  const photosWithUrls = await withSignedUrls(detail.photos, "thumb");

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader
        title={`Inventaire · ${detail.unit}`}
        right={
          <>
            {detail.is_published && (
              <span className="inline-block px-2 py-0.5 rounded text-xs bg-green-400/20 text-green-200 border border-green-400/40">
                Publié
              </span>
            )}
            <Link href="/inventaire" className="text-xs text-white/70 hover:text-white">
              ← Inventaire
            </Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-xs text-white/70 hover:text-white">
                Déconnexion
              </button>
            </form>
          </>
        }
      />

      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_2fr] max-w-7xl">
        <aside className="bg-white p-5 rounded shadow space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Données SERTI (readonly)
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-gray-500">Unit</dt>
            <dd className="font-mono">{detail.unit}</dd>
            <dt className="text-gray-500">VIN</dt>
            <dd className="font-mono text-xs">{detail.vin}</dd>
            <dt className="text-gray-500">Année</dt>
            <dd>{detail.year || "—"}</dd>
            <dt className="text-gray-500">Marque</dt>
            <dd>{detail.make}</dd>
            <dt className="text-gray-500">Modèle</dt>
            <dd>{detail.model}</dd>
            <dt className="text-gray-500">Km</dt>
            <dd className="font-mono">{detail.km.toLocaleString("fr-CA")}</dd>
            <dt className="text-gray-500">Couleur</dt>
            <dd>{detail.color || "—"}</dd>
            <dt className="text-gray-500">Catégorie</dt>
            <dd>{detail.category}</dd>
            <dt className="text-gray-500">Statut SERTI</dt>
            <dd>
              <StatusBadge row={detail} />
            </dd>
            {detail.avail_comment && (
              <>
                <dt className="text-gray-500">Note dispo</dt>
                <dd className="text-xs text-amber-800">{detail.avail_comment}</dd>
              </>
            )}
          </dl>
          <div className="pt-3 border-t">
            <p className="text-xs text-red-700 font-semibold uppercase tracking-wide">
              Coûtant interne — ne pas divulguer
            </p>
            <p className="font-mono text-lg mt-1">{currencyFmt.format(detail.cost)}</p>
          </div>
        </aside>

        <section className="bg-white p-5 rounded shadow">
          <ListingForm
            unit={detail.unit}
            defaults={{
              price_cad: detail.price_cad,
              description_fr: detail.description_fr,
              channels: detail.channels.filter((c): c is Channel =>
                (CHANNELS as readonly string[]).includes(c),
              ),
            }}
            isPublished={detail.is_published}
            vehicle={{
              year: detail.year,
              make: detail.make,
              model: detail.model,
              km: detail.km,
              color: detail.color,
              category: detail.category,
              cost: detail.cost,
            }}
          />
          <div className="mt-6 pt-6 border-t">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Affiché sur
            </h2>
            <ChannelStateTable state={detail.channel_state} />
          </div>
          <div className="mt-6 pt-6 border-t">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Photos
            </h2>
            <PhotoManager unit={detail.unit} initialPhotos={photosWithUrls} />
          </div>
        </section>
      </div>
    </main>
  );
}

const CHANNEL_ORDER: LiveChannel[] = [
  "native",
  "wix",
  "fb_marketplace",
  "fb_page",
  "google_vla",
  "lespac",
  "kijiji",
];

const PUBLISHED_STATUSES = new Set(["published", "saved", "upserted", "posted", "queued", "ok"]);

function ChannelStateTable({
  state,
}: {
  state: {
    channel: string;
    last_status: string | null;
    last_synced_at: string | null;
    external_id: string | null;
    external_url: string | null;
    last_error: string | null;
  }[];
}) {
  const byChannel = new Map(state.map((s) => [s.channel as LiveChannel, s]));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead className="text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="text-left py-1.5 pr-3">Canal</th>
            <th className="text-left py-1.5 pr-3">État</th>
            <th className="text-left py-1.5 pr-3">Dernière sync</th>
            <th className="text-left py-1.5 pr-3">Lien externe</th>
          </tr>
        </thead>
        <tbody>
          {CHANNEL_ORDER.map((ch) => {
            const s = byChannel.get(ch);
            const status = s?.last_status ?? null;
            const error = Boolean(s?.last_error) || status === "error";
            const published = status ? PUBLISHED_STATUSES.has(status) : false;
            const dot = error
              ? "bg-red-500"
              : published
                ? "bg-emerald-500"
                : status
                  ? "bg-gray-400"
                  : "bg-gray-200";
            return (
              <tr key={ch} className="border-t">
                <td className="py-1.5 pr-3 font-medium">{CHANNEL_LABELS[ch]}</td>
                <td className="py-1.5 pr-3">
                  <span className="inline-flex items-center gap-2">
                    <span className={"inline-block w-2 h-2 rounded-full " + dot} />
                    <span className="text-gray-700">{status ?? "—"}</span>
                  </span>
                  {s?.last_error && (
                    <div className="text-[11px] text-red-700 mt-0.5 max-w-md truncate" title={s.last_error}>
                      {s.last_error}
                    </div>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-gray-600 font-mono text-xs">
                  {s?.last_synced_at
                    ? new Date(s.last_synced_at).toLocaleString("fr-CA")
                    : "—"}
                </td>
                <td className="py-1.5 pr-3">
                  {s?.external_url ? (
                    <a
                      href={s.external_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-700 hover:underline text-xs break-all"
                    >
                      {s.external_id ?? "voir"}
                    </a>
                  ) : (
                    <span className="text-gray-400 text-xs">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
