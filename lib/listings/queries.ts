import { createClient } from "@/lib/supabase/server";
import { getVehicleByVin, listActiveVehicles, type Vehicle } from "@/lib/serti/wgi";
import type { Database } from "@/lib/supabase/types";

type ListingRow = Database["public"]["Tables"]["listing"]["Row"];
type PhotoRow = Database["public"]["Tables"]["vehicle_photo"]["Row"];

export interface InventoryRow extends Vehicle {
  price_cad: number;
  is_published: boolean;
  channels: string[];
  photo_count: number;
  has_hero: boolean;
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

  const vins = vehicles.map((v) => v.vin);
  const supabase = await createClient();

  const [listingsRes, photosRes] = await Promise.all([
    supabase.from("listing").select("vin, price_cad, is_published, channels").in("vin", vins),
    supabase.from("vehicle_photo").select("vin, is_hero").in("vin", vins),
  ]);

  if (listingsRes.error) throw new Error(`listings fetch: ${listingsRes.error.message}`);
  if (photosRes.error) throw new Error(`photos fetch: ${photosRes.error.message}`);

  const listingMap = new Map(listingsRes.data.map((l) => [l.vin, l]));
  const photoByVin = new Map<string, { count: number; hero: boolean }>();
  for (const p of photosRes.data) {
    const entry = photoByVin.get(p.vin) ?? { count: 0, hero: false };
    entry.count += 1;
    if (p.is_hero) entry.hero = true;
    photoByVin.set(p.vin, entry);
  }

  return vehicles.map((v) => {
    const l = listingMap.get(v.vin);
    const photos = photoByVin.get(v.vin);
    return {
      ...v,
      price_cad: l?.price_cad ?? 0,
      is_published: l?.is_published ?? false,
      channels: l?.channels ?? CHANNEL_DEFAULTS,
      photo_count: photos?.count ?? 0,
      has_hero: photos?.hero ?? false,
    };
  });
}

export async function fetchVehicleByVin(vin: string): Promise<InventoryDetail | null> {
  const vehicle = await getVehicleByVin(vin);
  if (!vehicle) return null;

  const supabase = await createClient();
  const [listingRes, photosRes] = await Promise.all([
    supabase
      .from("listing")
      .select("*")
      .eq("vin", vin)
      .maybeSingle(),
    supabase
      .from("vehicle_photo")
      .select("*")
      .eq("vin", vin)
      .order("position", { ascending: true }),
  ]);

  if (listingRes.error) throw new Error(`listing fetch: ${listingRes.error.message}`);
  if (photosRes.error) throw new Error(`photos fetch: ${photosRes.error.message}`);

  const l = listingRes.data ?? { ...emptyListing(), vin };
  const photos = photosRes.data;

  return {
    ...vehicle,
    price_cad: l.price_cad,
    description_fr: l.description_fr,
    is_published: l.is_published,
    channels: l.channels,
    photo_count: photos.length,
    has_hero: photos.some((p) => p.is_hero),
    photos,
  };
}
