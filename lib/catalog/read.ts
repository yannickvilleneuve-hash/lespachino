import { createAdminClient } from "@/lib/supabase/admin";
import { publicPhotoUrl } from "@/lib/catalog/photos";
import { siteVisible } from "@/lib/catalog/visibility";
import type { CatalogVehicle } from "@/lib/catalog/types";

export interface SnapshotPhoto {
  position: number;
  sourceUrl: string;
  storagePath: string | null;
}

export interface SnapshotVehicle {
  vehicle: CatalogVehicle;
  status: "online" | "sold";
  photos: SnapshotPhoto[];
}

interface PhotoRow {
  position: number;
  source_url: string;
  storage_path: string | null;
}

interface VehicleRow {
  id: string;
  payload: unknown;
  status: string;
  photos: PhotoRow[] | null;
}

/** Our mirrored copy when we have one, the LesPAC CDN when the mirror failed. */
export function photoSrc(p: SnapshotPhoto): string {
  return p.storagePath ? publicPhotoUrl(p.storagePath) : p.sourceUrl;
}

export function sortByYearDesc(rows: SnapshotVehicle[]): SnapshotVehicle[] {
  return [...rows].sort((a, b) => (b.vehicle.year ?? 0) - (a.vehicle.year ?? 0));
}

export function toSnapshotVehicle(row: VehicleRow): SnapshotVehicle {
  const photos = (row.photos ?? [])
    .map((p) => ({
      position: p.position,
      sourceUrl: p.source_url,
      storagePath: p.storage_path,
    }))
    .sort((a, b) => a.position - b.position);

  return {
    vehicle: row.payload as CatalogVehicle,
    status: row.status === "sold" ? "sold" : "online",
    photos,
  };
}

const SELECT = "id, payload, status, photos:catalog_photo(position, source_url, storage_path)";

/**
 * The public inventory: online vehicles that pass `siteVisible`, newest first.
 * One DB round-trip, versus the 20+ LesPAC calls a live fetch would cost.
 */
export async function listOnlineVehicles(): Promise<SnapshotVehicle[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("catalog_vehicle")
    .select(SELECT)
    .eq("status", "online");

  if (error) throw new Error(`snapshot read failed: ${error.message}`);

  const rows = ((data ?? []) as unknown as VehicleRow[]).map(toSnapshotVehicle);
  return sortByYearDesc(rows.filter((r) => siteVisible(r.vehicle)));
}

/**
 * One vehicle, sold ones included — an ad that left LesPAC still has links in
 * the wild (Google, Facebook, email), and a dead end serves nobody.
 */
export async function getSnapshotVehicle(id: string): Promise<SnapshotVehicle | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("catalog_vehicle")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`snapshot read failed: ${error.message}`);
  if (!data) return null;
  return toSnapshotVehicle(data as unknown as VehicleRow);
}
