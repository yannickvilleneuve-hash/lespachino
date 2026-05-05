import Link from "next/link";
import AppHeader from "@/app/app-header";
import { fetchInventory, type InventoryRow } from "@/lib/listings/queries";
import { CHANNELS, type Channel } from "@/lib/listings/schema";

export const dynamic = "force-dynamic";

const CHANNEL_LABELS: Record<Channel, string> = {
  native: "Hino",
  wix: "Wix",
  fb_marketplace: "Meta",
  fb_page: "FB Page",
  google_vla: "Google",
  lespac: "LesPAC",
  kijiji: "Kijiji",
  truckpaper: "TruckPaper",
  marketbook: "MarketBook",
};

const VISIBLE_CHANNELS: Channel[] = [
  "native",
  "wix",
  "lespac",
  "fb_marketplace",
  "google_vla",
  "truckpaper",
  "marketbook",
];

export default async function DestinationsPage() {
  const rows = (await fetchInventory())
    .filter((row) => !row.hidden && row.status !== "sold")
    .sort((a, b) => a.unit.localeCompare(b.unit, "fr", { numeric: true }));

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader
        title="Destinations"
        right={
          <Link href="/dashboard" className="text-xs text-white/70 hover:text-white">
            ← Dashboard
          </Link>
        }
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Unité</th>
              <th className="px-3 py-2 text-left">Véhicule</th>
              <th className="px-3 py-2 text-right">Prix</th>
              {VISIBLE_CHANNELS.map((channel) => (
                <th key={channel} className="px-3 py-2 text-center">
                  {CHANNEL_LABELS[channel]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">
            {rows.map((row) => (
              <tr key={row.unit} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">
                  <Link
                    href={`/inventaire/${encodeURIComponent(row.unit)}`}
                    className="text-blue-700 hover:underline"
                  >
                    {row.unit}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">
                    {row.year} {row.make} {row.model}
                  </div>
                  <div className="text-xs text-gray-500">{row.category}</div>
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {row.price_cad > 0 ? row.price_cad.toLocaleString("fr-CA") + " $" : "-"}
                </td>
                {VISIBLE_CHANNELS.map((channel) => (
                  <td key={channel} className="px-3 py-2 text-center">
                    <DestinationPill row={row} channel={channel} />
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={3 + VISIBLE_CHANNELS.length}
                  className="px-3 py-8 text-center text-gray-500"
                >
                  Aucun véhicule actif.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function DestinationPill({ row, channel }: { row: InventoryRow; channel: Channel }) {
  const selected = normalizeRowChannels(row).includes(channel);
  const state = row.channel_state.find((s) => s.channel === channel);
  if (!selected) return <span className="text-xs text-gray-300">-</span>;
  if (state?.last_error || state?.last_status === "error") {
    return (
      <span className="inline-block rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
        Erreur
      </span>
    );
  }
  if (state?.last_status === "feed_ready") {
    return (
      <span className="inline-block rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
        Feed
      </span>
    );
  }
  if (
    state?.last_status &&
    ["published", "saved", "upserted", "posted", "ok", "claimed"].includes(state.last_status)
  ) {
    return (
      <span className="inline-block rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
        Fait
      </span>
    );
  }
  return (
    <span className="inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
      À faire
    </span>
  );
}

function normalizeRowChannels(row: InventoryRow): Channel[] {
  return row.channels.filter((channel): channel is Channel =>
    (CHANNELS as readonly string[]).includes(channel),
  );
}
