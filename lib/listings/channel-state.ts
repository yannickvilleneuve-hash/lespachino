import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type Channel =
  | "native"
  | "fb_marketplace"
  | "fb_page"
  | "google_vla"
  | "lespac"
  | "kijiji"
  | "truckpaper"
  | "marketbook"
  | "wix";

export const CHANNEL_LABELS: Record<Channel, string> = {
  native: "Fiche véhicule",
  fb_marketplace: "Facebook Marketplace",
  fb_page: "Page Facebook",
  google_vla: "Google Vehicle Ads",
  lespac: "LesPAC",
  kijiji: "Kijiji",
  truckpaper: "TruckPaper",
  marketbook: "MarketBook",
  wix: "Page Inventaire (Wix)",
};

export interface ChannelStateUpdate {
  unit: string;
  channel: Channel;
  status: string;
  external_id?: string | null;
  external_url?: string | null;
  error?: string | null;
}

/** Upsert ligne listing_channel_state. last_synced_at = now(). */
export async function recordChannelState(
  supabase: SupabaseClient<Database>,
  u: ChannelStateUpdate,
): Promise<void> {
  const { error } = await supabase
    .from("listing_channel_state")
    .upsert(
      {
        unit: u.unit,
        channel: u.channel,
        last_status: u.status,
        last_synced_at: new Date().toISOString(),
        external_id: u.external_id ?? null,
        external_url: u.external_url ?? null,
        last_error: u.error ?? null,
      },
      { onConflict: "unit,channel" },
    );
  if (error) {
    // Best-effort: ne pas faire échouer le push réel pour un log raté.
    console.error(`recordChannelState ${u.channel} ${u.unit}:`, error.message);
  }
}
