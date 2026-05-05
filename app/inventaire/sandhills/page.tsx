import Link from "next/link";
import AppHeader from "@/app/app-header";
import { fetchPublicListings, type PublicListing } from "@/lib/listings/public";
import SandhillsHelper from "./sandhills-helper";

export const dynamic = "force-dynamic";

const VIP_URL = "https://vip.marketbook.ca/import";

const dateFmt = new Intl.DateTimeFormat("fr-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function publicOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://feeds.hinochicoutimi.com";
}

export default async function SandhillsPage() {
  const [truckpaper, marketbook] = await Promise.all([
    fetchPublicListings({ channel: "truckpaper" }),
    fetchPublicListings({ channel: "marketbook" }),
  ]);
  const byUnit = new Map<string, PublicListing>();
  for (const listing of [...truckpaper, ...marketbook]) {
    byUnit.set(listing.unit, listing);
  }
  const all = [...byUnit.values()].sort((a, b) => a.unit.localeCompare(b.unit));
  const inFeed = all.filter((listing) => listing.hero_url !== null);
  const skipped = all.filter((listing) => listing.hero_url === null);
  const feedUrl = new URL("/feed/sandhills.csv", publicOrigin()).toString();
  const units = inFeed.map((listing) => listing.unit);

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader
        title="Sandhills"
        right={
          <>
            <span className="text-xs text-white/70">
              {inFeed.length} unité{inFeed.length > 1 ? "s" : ""} dans le feed
            </span>
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

      <div className="max-w-6xl p-6 space-y-5">
        <section className="grid gap-3 md:grid-cols-4">
          <Metric label="Feed prêt" value={inFeed.length.toString()} tone="green" />
          <Metric label="TruckPaper" value={truckpaper.length.toString()} />
          <Metric label="MarketBook" value={marketbook.length.toString()} />
          <Metric label="Sans photo principale" value={skipped.length.toString()} tone={skipped.length > 0 ? "amber" : "gray"} />
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="border rounded bg-white">
            <div className="border-b bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Feed Sandhills
            </div>
            <div className="space-y-3 p-3 text-sm">
              <div>
                <div className="text-xs text-gray-500">URL</div>
                <code className="mt-1 block break-all rounded bg-gray-100 px-2 py-1 text-xs">
                  {feedUrl}
                </code>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Info label="Généré" value={dateFmt.format(new Date())} />
                <Info label="Fichier" value="sandhills-inventory.csv" />
              </div>
              <SandhillsHelper feedUrl={feedUrl} vipUrl={VIP_URL} units={units} />
            </div>
          </div>

          <div className="border rounded bg-white">
            <div className="border-b bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Unités dans le feed
            </div>
            <div className="max-h-[460px] overflow-y-auto">
              {inFeed.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-gray-500">
                  Aucune unité sélectionnée.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {inFeed.map((listing) => (
                      <tr key={listing.unit} className="border-t first:border-t-0">
                        <td className="px-3 py-2 font-mono text-xs">
                          <Link
                            href={`/inventaire/${encodeURIComponent(listing.unit)}`}
                            className="text-blue-700 hover:underline"
                          >
                            {listing.unit}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600">
                          {listing.year} {listing.make} {listing.model}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  tone = "gray",
}: {
  label: string;
  value: string;
  tone?: "gray" | "green" | "amber";
}) {
  const color =
    tone === "green"
      ? "text-emerald-700"
      : tone === "amber"
        ? "text-amber-700"
        : "text-gray-900";
  return (
    <div className="border rounded bg-white px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className={"mt-1 text-2xl font-semibold " + color}>{value}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 font-mono text-xs text-gray-800">{value}</div>
    </div>
  );
}
