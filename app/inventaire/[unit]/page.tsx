import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchVehicleByUnit } from "@/lib/listings/queries";
import { withSignedUrls } from "@/lib/listings/photos";
import { CHANNELS, type Channel } from "@/lib/listings/schema";
import { isLespacReady } from "@/lib/lespac/config";
import AppHeader from "@/app/app-header";
import { StatusBadge } from "../status-badges";
import ListingForm, { type ChannelAvailability } from "./listing-form";
import PhotoManager from "./photo-manager";
import CaptureMobileButton from "./capture-mobile";
import WalkaroundVideo from "./walkaround-video";

export const dynamic = "force-dynamic";

const currencyFmt = new Intl.NumberFormat("fr-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 2,
});

function getChannelAvailability(): ChannelAvailability {
  return {
    native: { ready: true, reason: "Fiche web Hino active" },
    wix: { ready: false, reason: "Intégration Wix supprimée" },
    fb_marketplace: {
      ready: true,
      reason: "Feed Meta prêt; prix public requis",
    },
    fb_page: { ready: false, reason: "Page Facebook non configurée" },
    google_vla: {
      ready: true,
      reason: "Feed Google prêt; prix public requis",
    },
    lespac: isLespacReady()
      ? { ready: true, reason: "API Lespac connectée" }
      : { ready: false, reason: "API Lespac non configurée" },
    kijiji: { ready: false, reason: "Connecteur Kijiji à faire" },
    truckpaper: { ready: true, reason: "Envoi automatique disponible" },
    marketbook: { ready: true, reason: "Envoi automatique disponible" },
  };
}

export default async function EditPage({
  params,
}: {
  params: Promise<{ unit: string }>;
}) {
  const { unit } = await params;
  const detail = await fetchVehicleByUnit(decodeURIComponent(unit));
  if (!detail) notFound();
  const [photosWithUrls, channelAvailability] = await Promise.all([
    withSignedUrls(detail.photos, "thumb"),
    Promise.resolve(getChannelAvailability()),
  ]);
  const enabledSelectedChannels = detail.channels.filter(
    (c): c is Channel =>
      (CHANNELS as readonly string[]).includes(c) && channelAvailability[c as Channel].ready,
  );

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
            <Link
              href={`/inventaire/${encodeURIComponent(detail.unit)}/pdf`}
              className="text-xs text-white/70 hover:text-white"
              target="_blank"
            >
              Fiche PDF
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
            Infos du camion
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-gray-500">Unité</dt>
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
            <p className="font-mono text-lg mt-1">
              {currencyFmt.format(detail.cost_transactions_total)}
            </p>
            <CostTransactions rows={detail.cost_transactions} />
          </div>
          <PublicationChecklist
            description={detail.description_fr}
            photoCount={detail.photo_count}
            hasHero={detail.has_hero}
            channels={enabledSelectedChannels.length}
          />
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
            channelAvailability={channelAvailability}
            readiness={{
              hasDescription: detail.description_fr.trim().length > 0,
              photoCount: detail.photo_count,
              hasHero: detail.has_hero,
              available: Boolean(detail.available && detail.status === "available"),
            }}
            channelState={detail.channel_state}
            vehicle={{
              year: detail.year,
              make: detail.make,
              model: detail.model,
              km: detail.km,
              color: detail.color,
              category: detail.category,
            }}
          />
          <div id="photos" className="mt-6 pt-6 border-t scroll-mt-24">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Photos
              </h2>
              <div className="w-56">
                <CaptureMobileButton unit={detail.unit} />
              </div>
            </div>
            <PhotoManager unit={detail.unit} initialPhotos={photosWithUrls} />
          </div>
          <div className="mt-6 pt-6 border-t">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Vidéo
            </h2>
            <WalkaroundVideo unit={detail.unit} currentUrl={detail.walkaround_video_url} />
          </div>
        </section>
      </div>
    </main>
  );
}

function CostTransactions({
  rows,
}: {
  rows: { description: string; invoice: string; amount: number }[];
}) {
  if (rows.length === 0) {
    return (
      <p className="mt-1 text-xs text-gray-500">
        Aucun détail de coûtant trouvé dans SERTI.
      </p>
    );
  }
  return (
    <div className="mt-2 border rounded overflow-hidden">
      <table className="w-full text-xs">
        <tbody>
          {rows.map((row, index) => {
            const description = row.description || row.invoice || "Transaction";
            return (
              <tr key={`${description}-${index}`} className="border-t first:border-t-0">
                <td className="py-1 px-2 text-gray-700">{description}</td>
                <td className="py-1 px-2 text-right font-mono">
                  {currencyFmt.format(row.amount)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PublicationChecklist({
  description,
  photoCount,
  hasHero,
  channels,
}: {
  description: string;
  photoCount: number;
  hasHero: boolean;
  channels: number;
}) {
  const items = [
    {
      label: "Description",
      ok: description.trim().length > 0,
      href: "#description",
      action: "Créer",
    },
    { label: "Photos", ok: photoCount > 0, href: "#photos", action: "Ajouter" },
    { label: "Photo principale", ok: hasHero, href: "#photos", action: "Choisir" },
    { label: "Plateformes", ok: channels > 0, href: "#canaux", action: "Choisir" },
  ];
  const ready = items.every((item) => item.ok);
  return (
    <div className="pt-3 border-t">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Prêt à publier
      </h3>
      <ul className="space-y-1.5 text-sm">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2">
            <span
              className={
                "inline-flex w-5 h-5 rounded-full items-center justify-center text-xs font-bold " +
                (item.ok ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800")
              }
            >
              {item.ok ? "✓" : "!"}
            </span>
            <span className={item.ok ? "text-gray-700" : "text-amber-800"}>{item.label}</span>
            {!item.ok && (
              <a href={item.href} className="ml-auto text-xs text-blue-700 hover:underline">
                {item.action}
              </a>
            )}
          </li>
        ))}
      </ul>
      {ready && (
        <p className="mt-2 text-xs text-emerald-700">
          Données complètes. Le bouton publier sauvegarde avant d&apos;envoyer.
        </p>
      )}
    </div>
  );
}
