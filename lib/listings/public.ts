import { createAdminClient } from "@/lib/supabase/admin";
import {
  listInventoryVehicles,
  getVehicleByUnit,
  type Vehicle,
} from "@/lib/serti/wgi";
import { variantPath, type PhotoVariant } from "@/lib/photos/resize";
import type { Database } from "@/lib/supabase/types";
import { normalizeChannels, type Channel } from "./schema";
import { publicMileageKm } from "./mileage";

type PhotoRow = Database["public"]["Tables"]["vehicle_photo"]["Row"];

/** Vehicle tel qu'il apparaît au public — **sans** coûtant. */
export type PublicVehicle = Omit<Vehicle, "cost">;

export interface PublicListing extends PublicVehicle {
  description_fr: string;
  hero_url: string | null;
  photo_count: number;
}

export interface PublicListingDetail extends PublicListing {
  photos: { url_medium: string; url_thumb: string; url_original: string; is_hero: boolean }[];
  walkaround_video_url: string | null;
}

export interface PublicListingOptions {
  /** Canal à inclure. `native` par défaut pour le site public; `null` ignore le filtre. */
  channel?: Channel | null;
}

export function publicPhotoUrl(storagePath: string, variant: PhotoVariant = "original"): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new Error("NEXT_PUBLIC_SUPABASE_URL requis");
  return `${base}/storage/v1/object/public/vehicle-photos/${variantPath(storagePath, variant)}`;
}

function stripCost<V extends Vehicle>(v: V): PublicVehicle {
  const { cost: _cost, ...rest } = v;
  void _cost;
  return { ...rest, km: publicMileageKm(rest) };
}

export async function fetchPublicListings(options: PublicListingOptions = {}): Promise<PublicListing[]> {
  const channel = options.channel === undefined ? "native" : options.channel;
  const supabase = createAdminClient();
  let query = supabase
    .from("listing")
    .select("unit, description_fr, is_published, hidden")
    .eq("is_published", true)
    .eq("hidden", false);
  if (channel) query = query.contains("channels", [channel]);
  const listingsRes = await query;
  if (listingsRes.error) throw new Error(`listings: ${listingsRes.error.message}`);
  // Filtre physique appliqué via SERTI WGIAVL='1' (cf listInventoryVehicles).
  // Quand un camion est livré, SERTI bascule WGIAVL='2' et il disparaît du
  // join — pas besoin d'ajouter de logique de fenêtre temporelle.
  const eligible = listingsRes.data ?? [];
  const units = eligible.map((l) => l.unit);
  if (units.length === 0) return [];

  const [photosRes, vehicles] = await Promise.all([
    supabase
      .from("vehicle_photo")
      .select("unit, storage_path, position, is_hero")
      .in("unit", units),
    listInventoryVehicles(),
  ]);
  if (photosRes.error) throw new Error(`photos: ${photosRes.error.message}`);

  const vehicleMap = new Map(vehicles.map((v) => [v.unit, v]));
  const photoByUnit = new Map<string, PhotoRow[]>();
  for (const p of photosRes.data as PhotoRow[]) {
    const arr = photoByUnit.get(p.unit) ?? [];
    arr.push(p);
    photoByUnit.set(p.unit, arr);
  }

  const rows: PublicListing[] = [];
  for (const l of eligible) {
    const v = vehicleMap.get(l.unit);
    if (!v) continue; // SERTI a perdu le véhicule entre-temps
    const photos = photoByUnit.get(l.unit) ?? [];
    const hero = photos.find((p) => p.is_hero) ?? photos[0];
    rows.push({
      ...stripCost(v),
      description_fr: l.description_fr,
      hero_url: hero ? publicPhotoUrl(hero.storage_path, "medium") : null,
      photo_count: photos.length,
    });
  }
  return rows;
}

export async function fetchPublicListingByUnit(
  unit: string,
  options: PublicListingOptions = {},
): Promise<PublicListingDetail | null> {
  const channel = options.channel === undefined ? "native" : options.channel;
  const supabase = createAdminClient();
  const [listingRes, photosRes, vehicle] = await Promise.all([
    supabase
      .from("listing")
      .select("description_fr, is_published, hidden, channels, walkaround_video_url")
      .eq("unit", unit)
      .maybeSingle(),
    supabase
      .from("vehicle_photo")
      .select("storage_path, position, is_hero")
      .eq("unit", unit)
      .order("position", { ascending: true }),
    getVehicleByUnit(unit),
  ]);
  if (listingRes.error) throw new Error(`listing: ${listingRes.error.message}`);
  if (photosRes.error) throw new Error(`photos: ${photosRes.error.message}`);

  const l = listingRes.data;
  if (!l || !l.is_published || l.hidden) return null;
  if (channel && !normalizeChannels(l.channels, []).includes(channel)) return null;
  // WGIAVL='1' chez SERTI = présent. Quand SERTI bascule à '2' (livré),
  // getVehicleByUnit le retournera quand même (pas filtré), donc on
  // vérifie ici aussi pour exclure les véhicules hors lot du public.
  if (!vehicle || !vehicle.available) return null;

  const photos = photosRes.data.map((p) => ({
    url_medium: publicPhotoUrl(p.storage_path, "medium"),
    url_thumb: publicPhotoUrl(p.storage_path, "thumb"),
    url_original: publicPhotoUrl(p.storage_path, "original"),
    is_hero: p.is_hero,
  }));
  const hero = photos.find((p) => p.is_hero) ?? photos[0];

  return {
    ...stripCost(vehicle),
    description_fr: l.description_fr,
    hero_url: hero ? hero.url_medium : null,
    photos,
    photo_count: photos.length,
    walkaround_video_url: l.walkaround_video_url ?? null,
  };
}
