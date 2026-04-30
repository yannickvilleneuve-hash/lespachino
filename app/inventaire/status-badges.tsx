import type { InventoryRow } from "@/lib/listings/queries";
import { CHANNEL_LABELS, type Channel } from "@/lib/listings/channel-state";

const STATUS_RANK: Record<InventoryRow["status"], number> = {
  available: 0,
  quoted: 1,
  sold: 2,
};

export function statusRank(r: InventoryRow): number {
  return STATUS_RANK[r.status];
}

export function StatusBadge({ row, dense = false }: { row: InventoryRow; dense?: boolean }) {
  const sz = dense ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  if (row.status === "sold") {
    const days = row.sold_days_ago ?? 0;
    const expired = row.sold_grace_expired;
    return (
      <span
        className={
          sz +
          " inline-block rounded font-medium " +
          (expired ? "bg-gray-300 text-gray-600" : "bg-gray-200 text-gray-800")
        }
        title={
          row.sold_at
            ? `Vendu le ${new Date(row.sold_at).toLocaleDateString("fr-CA")}` +
              (expired ? " — délai de grâce 10j dépassé" : "")
            : "Vendu"
        }
      >
        Vendu · J-{days}
        {expired ? " ⚠" : ""}
      </span>
    );
  }
  if (row.status === "quoted") {
    return (
      <span
        className={sz + " inline-block rounded font-medium bg-amber-100 text-amber-800"}
        title={
          row.quoted_at
            ? `En soumission depuis le ${new Date(row.quoted_at).toLocaleDateString("fr-CA")}`
            : "En soumission"
        }
      >
        En soumission
      </span>
    );
  }
  return (
    <span className={sz + " inline-block rounded font-medium bg-emerald-100 text-emerald-800"}>
      Disponible
    </span>
  );
}

const CHANNEL_ORDER: Channel[] = [
  "native",
  "wix",
  "fb_marketplace",
  "fb_page",
  "google_vla",
  "lespac",
  "kijiji",
];

const ICON_BY_CHANNEL: Record<Channel, string> = {
  native: "🌐",
  wix: "Wx",
  fb_marketplace: "FB",
  fb_page: "Pg",
  google_vla: "Gg",
  lespac: "Lp",
  kijiji: "Kj",
};

function isPublishedStatus(status: string | null): boolean {
  if (!status) return false;
  const ok = ["published", "saved", "upserted", "posted", "queued", "ok"];
  return ok.includes(status);
}

function isErrorStatus(status: string | null, last_error: string | null): boolean {
  if (last_error) return true;
  return status === "error";
}

export function ChannelDots({
  state,
  className = "",
}: {
  state: InventoryRow["channel_state"];
  className?: string;
}) {
  const byChannel = new Map(state.map((s) => [s.channel as Channel, s]));
  return (
    <div className={"flex flex-wrap gap-1 " + className}>
      {CHANNEL_ORDER.map((ch) => {
        const s = byChannel.get(ch);
        const published = isPublishedStatus(s?.last_status ?? null);
        const error = isErrorStatus(s?.last_status ?? null, s?.last_error ?? null);
        const color = error
          ? "bg-red-100 text-red-700 border-red-300"
          : published
            ? "bg-emerald-100 text-emerald-800 border-emerald-300"
            : "bg-gray-100 text-gray-400 border-gray-200";
        const tip =
          `${CHANNEL_LABELS[ch]}: ${s?.last_status ?? "—"}` +
          (s?.last_synced_at
            ? `\nSync: ${new Date(s.last_synced_at).toLocaleString("fr-CA")}`
            : "") +
          (s?.last_error ? `\nErreur: ${s.last_error}` : "");
        return (
          <span
            key={ch}
            title={tip}
            className={
              "inline-flex items-center justify-center w-7 h-5 rounded text-[10px] border font-mono " +
              color
            }
          >
            {ICON_BY_CHANNEL[ch]}
          </span>
        );
      })}
    </div>
  );
}
