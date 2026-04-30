import { createClient } from "@/lib/supabase/server";
import { getVehicleByUnit, listInventoryVehicles, type Vehicle } from "@/lib/serti/wgi";
import { publicPhotoUrl } from "@/lib/listings/public";
import { reconcileStatuses, soldDaysAgo, isSoldGraceExpired, SOLD_GRACE_DAYS } from "@/lib/listings/sync-status";
import type { Database } from "@/lib/supabase/types";

type ListingRow = Database["public"]["Tables"]["listing"]["Row"];
type PhotoRow = Database["public"]["Tables"]["vehicle_photo"]["Row"];
type ChannelStateRow = Database["public"]["Tables"]["listing_channel_state"]["Row"];

export interface InventoryRow extends Vehicle {
  price_cad: number;
  is_published: boolean;
  channels: string[];
  photo_count: number;
  has_hero: boolean;
  hero_url: string | null;
  hidden: boolean;
  views_7d: number;
  leads_7d: number;
  sold_at: string | null;
  quoted_at: string | null;
  /** Jours depuis la vente (null si pas vendu). */
  sold_days_ago: number | null;
  /** Vendu et > 10 jours: doit être exclu du catalogue public. */
  sold_grace_expired: boolean;
  /** État live de chaque canal (où est-il affiché?). */
  channel_state: ChannelStateRow[];
}

export interface InventoryDetail extends InventoryRow {
  description_fr: string;
  photos: PhotoRow[];
  channel_state: ChannelStateRow[];
}

const CHANNEL_DEFAULTS: string[] = ["native", "fb", "lespac", "kijiji"];

function emptyListing(): Pick<ListingRow, "price_cad" | "description_fr" | "is_published" | "channels"> {
  return {
    price_cad: 0,
    description_fr: "",
    is_published: false,
    channels: CHANNEL_DEFAULTS,
  };
}

export { SOLD_GRACE_DAYS };

export async function fetchInventory(): Promise<InventoryRow[]> {
  const vehicles = await listInventoryVehicles();
  if (vehicles.length === 0) return [];

  const units = vehicles.map((v) => v.unit);
  const supabase = await createClient();

  // Réconcilie SERTI→Supabase (stamp sold_at/quoted_at sur transitions).
  await reconcileStatuses(vehicles, supabase);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [listingsRes, photosRes, viewsRes, leadsRes, channelStateRes] = await Promise.all([
    supabase
      .from("listing")
      .select("unit, price_cad, is_published, channels, hidden, sold_at, quoted_at")
      .in("unit", units),
    supabase
      .from("vehicle_photo")
      .select("unit, is_hero, storage_path, position")
      .in("unit", units)
      .order("position", { ascending: true }),
    supabase
      .from("view_event")
      .select("unit")
      .in("unit", units)
      .gte("created_at", sevenDaysAgo),
    supabase
      .from("lead")
      .select("unit")
      .in("unit", units)
      .gte("created_at", sevenDaysAgo),
    supabase
      .from("listing_channel_state")
      .select("*")
      .in("unit", units),
  ]);

  if (listingsRes.error) throw new Error(`listings fetch: ${listingsRes.error.message}`);
  if (photosRes.error) throw new Error(`photos fetch: ${photosRes.error.message}`);
  if (viewsRes.error) throw new Error(`views fetch: ${viewsRes.error.message}`);
  if (leadsRes.error) throw new Error(`leads fetch: ${leadsRes.error.message}`);
  if (channelStateRes.error) throw new Error(`channel_state fetch: ${channelStateRes.error.message}`);

  const channelStateByUnit = new Map<string, ChannelStateRow[]>();
  for (const cs of channelStateRes.data ?? []) {
    const arr = channelStateByUnit.get(cs.unit) ?? [];
    arr.push(cs);
    channelStateByUnit.set(cs.unit, arr);
  }

  const listingMap = new Map(listingsRes.data.map((l) => [l.unit, l]));
  const photoByUnit = new Map<
    string,
    { count: number; hero: boolean; hero_path: string | null; first_path: string | null }
  >();
  for (const p of photosRes.data) {
    const entry =
      photoByUnit.get(p.unit) ??
      { count: 0, hero: false, hero_path: null, first_path: null };
    entry.count += 1;
    if (p.is_hero) {
      entry.hero = true;
      entry.hero_path = p.storage_path;
    }
    if (entry.first_path === null) entry.first_path = p.storage_path;
    photoByUnit.set(p.unit, entry);
  }

  const viewCount = new Map<string, number>();
  for (const v of viewsRes.data) viewCount.set(v.unit, (viewCount.get(v.unit) ?? 0) + 1);
  const leadCount = new Map<string, number>();
  for (const l of leadsRes.data) leadCount.set(l.unit, (leadCount.get(l.unit) ?? 0) + 1);

  return vehicles.map((v) => {
    const l = listingMap.get(v.unit);
    const photos = photoByUnit.get(v.unit);
    const heroPath = photos?.hero_path ?? photos?.first_path ?? null;
    const sold_at = l?.sold_at ?? null;
    return {
      ...v,
      price_cad: l?.price_cad ?? 0,
      is_published: l?.is_published ?? false,
      channels: l?.channels ?? CHANNEL_DEFAULTS,
      photo_count: photos?.count ?? 0,
      has_hero: photos?.hero ?? false,
      hero_url: heroPath ? publicPhotoUrl(heroPath, "thumb") : null,
      hidden: l?.hidden ?? false,
      views_7d: viewCount.get(v.unit) ?? 0,
      leads_7d: leadCount.get(v.unit) ?? 0,
      sold_at,
      quoted_at: l?.quoted_at ?? null,
      sold_days_ago: soldDaysAgo(sold_at),
      sold_grace_expired: isSoldGraceExpired(sold_at),
      channel_state: channelStateByUnit.get(v.unit) ?? [],
    };
  });
}

export async function fetchVehicleByUnit(unit: string): Promise<InventoryDetail | null> {
  const vehicle = await getVehicleByUnit(unit);
  if (!vehicle) return null;

  const supabase = await createClient();

  // Réconcilie statut sur fetch détail (stamp transitions si applicable).
  await reconcileStatuses([vehicle], supabase);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [listingRes, photosRes, viewsRes, leadsRes, channelStateRes] = await Promise.all([
    supabase.from("listing").select("*").eq("unit", unit).maybeSingle(),
    supabase
      .from("vehicle_photo")
      .select("*")
      .eq("unit", unit)
      .order("position", { ascending: true }),
    supabase
      .from("view_event")
      .select("unit")
      .eq("unit", unit)
      .gte("created_at", sevenDaysAgo),
    supabase
      .from("lead")
      .select("unit")
      .eq("unit", unit)
      .gte("created_at", sevenDaysAgo),
    supabase
      .from("listing_channel_state")
      .select("*")
      .eq("unit", unit),
  ]);

  if (listingRes.error) throw new Error(`listing fetch: ${listingRes.error.message}`);
  if (photosRes.error) throw new Error(`photos fetch: ${photosRes.error.message}`);
  if (channelStateRes.error) throw new Error(`channel_state fetch: ${channelStateRes.error.message}`);

  const l = listingRes.data ?? { ...emptyListing(), unit, sold_at: null, quoted_at: null };
  const photos = photosRes.data;
  const sold_at = (l as { sold_at?: string | null }).sold_at ?? null;
  const quoted_at = (l as { quoted_at?: string | null }).quoted_at ?? null;

  return {
    ...vehicle,
    price_cad: l.price_cad,
    description_fr: l.description_fr,
    is_published: l.is_published,
    channels: l.channels,
    hidden: (l as { hidden?: boolean }).hidden ?? false,
    photo_count: photos.length,
    has_hero: photos.some((p) => p.is_hero),
    hero_url: (() => {
      const hero = photos.find((p) => p.is_hero) ?? photos[0];
      return hero ? publicPhotoUrl(hero.storage_path, "thumb") : null;
    })(),
    views_7d: viewsRes.data?.length ?? 0,
    leads_7d: leadsRes.data?.length ?? 0,
    sold_at,
    quoted_at,
    sold_days_ago: soldDaysAgo(sold_at),
    sold_grace_expired: isSoldGraceExpired(sold_at),
    photos,
    channel_state: channelStateRes.data ?? [],
  };
}
