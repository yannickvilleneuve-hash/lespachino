import { createAdminClient } from "@/lib/supabase/admin";
import { listActiveVehicles, getVehicleByUnit, type Vehicle } from "@/lib/serti/wgi";
import { variantPath, type PhotoVariant } from "@/lib/photos/resize";
import type { Database } from "@/lib/supabase/types";

type ListingRow = Database["public"]["Tables"]["listing"]["Row"];
type PhotoRow = Database["public"]["Tables"]["vehicle_photo"]["Row"];

/** Vehicle tel qu'il apparaît au public — **sans** coûtant. */
export type PublicVehicle = Omit<Vehicle, "cost">;

export interface PublicListing extends PublicVehicle {
  price_cad: number;
  description_fr: string;
  hero_url: string | null;
  photo_count: number;
}

export interface PublicListingDetail extends PublicListing {
  photos: { url_medium: string; url_thumb: string; url_original: string; is_hero: boolean }[];
}



export function publicPhotoUrl(storagePath: string, variant: PhotoVariant = "original"): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new Error("NEXT_PUBLIC_SUPABASE_URL requis");
  return `${base}/storage/v1/object/public/vehicle-photos/${variantPath(storagePath, variant)}`;
}

function stripCost<V extends Vehicle>(v: V): PublicVehicle {
  const { cost: _cost, ...rest } = v;
  void _cost;
  return rest;
}

export async function fetchPublicListings(): Promise<PublicListing[]> {
  const supabase = createAdminClient();
  const listingsRes = await supabase
    .from("listing")
    .select("unit, price_cad, description_fr, is_published, hidden")
    .eq("is_published", true)
    .eq("hidden", false);
  if (listingsRes.error) throw new Error(`listings: ${listingsRes.error.message}`);
  const units = listingsRes.data.map((l) => l.unit);
  if (units.length === 0) return [];

  const [photosRes, vehicles] = await Promise.all([
    supabase
      .from("vehicle_photo")
      .select("unit, storage_path, position, is_hero")
      .in("unit", units),
    listActiveVehicles(),
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
  for (const l of listingsRes.data as Pick<ListingRow, "unit" | "price_cad" | "description_fr">[]) {
    const v = vehicleMap.get(l.unit);
    if (!v) continue; // SERTI a perdu le véhicule entre-temps
    const photos = photoByUnit.get(l.unit) ?? [];
    const hero = photos.find((p) => p.is_hero) ?? photos[0];
    rows.push({
      ...stripCost(v),
      price_cad: l.price_cad,
      description_fr: l.description_fr,
      hero_url: hero ? publicPhotoUrl(hero.storage_path, "medium") : null,
      photo_count: photos.length,
    });
  }
  return rows;
}

export async function fetchPublicListingByUnit(unit: string): Promise<PublicListingDetail | null> {
  const supabase = createAdminClient();
  const [listingRes, photosRes, vehicle] = await Promise.all([
    supabase
      .from("listing")
      .select("price_cad, description_fr, is_published, hidden")
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
  if (!vehicle) return null;

  const photos = photosRes.data.map((p) => ({
    url_medium: publicPhotoUrl(p.storage_path, "medium"),
    url_thumb: publicPhotoUrl(p.storage_path, "thumb"),
    url_original: publicPhotoUrl(p.storage_path, "original"),
    is_hero: p.is_hero,
  }));
  const hero = photos.find((p) => p.is_hero) ?? photos[0];

  return {
    ...stripCost(vehicle),
    price_cad: l.price_cad,
    description_fr: l.description_fr,
    hero_url: hero ? hero.url_medium : null,
    photos,
    photo_count: photos.length,
  };
}
