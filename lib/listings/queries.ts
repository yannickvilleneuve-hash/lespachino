import { createClient } from "@/lib/supabase/server";
import { getVehicleByUnit, listActiveVehicles, type Vehicle } from "@/lib/serti/wgi";
import { publicPhotoUrl } from "@/lib/listings/public";
import type { Database } from "@/lib/supabase/types";

type ListingRow = Database["public"]["Tables"]["listing"]["Row"];
type PhotoRow = Database["public"]["Tables"]["vehicle_photo"]["Row"];

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
}

export interface InventoryDetail extends InventoryRow {
  description_fr: string;
  photos: PhotoRow[];
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

export async function fetchInventory(): Promise<InventoryRow[]> {
  const vehicles = await listActiveVehicles();
  if (vehicles.length === 0) return [];

  const units = vehicles.map((v) => v.unit);
  const supabase = await createClient();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [listingsRes, photosRes, viewsRes, leadsRes] = await Promise.all([
    supabase
      .from("listing")
      .select("unit, price_cad, is_published, channels, hidden")
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
  ]);

  if (listingsRes.error) throw new Error(`listings fetch: ${listingsRes.error.message}`);
  if (photosRes.error) throw new Error(`photos fetch: ${photosRes.error.message}`);
  if (viewsRes.error) throw new Error(`views fetch: ${viewsRes.error.message}`);
  if (leadsRes.error) throw new Error(`leads fetch: ${leadsRes.error.message}`);

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
    };
  });
}

export async function fetchVehicleByUnit(unit: string): Promise<InventoryDetail | null> {
  const vehicle = await getVehicleByUnit(unit);
  if (!vehicle) return null;

  const supabase = await createClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [listingRes, photosRes, viewsRes, leadsRes] = await Promise.all([
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
  ]);

  if (listingRes.error) throw new Error(`listing fetch: ${listingRes.error.message}`);
  if (photosRes.error) throw new Error(`photos fetch: ${photosRes.error.message}`);

  const l = listingRes.data ?? { ...emptyListing(), unit };
  const photos = photosRes.data;

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
    photos,
  };
}
