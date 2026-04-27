import { createClient } from "@/lib/supabase/server";
import { variantPath, type PhotoVariant } from "@/lib/photos/resize";
import type { Database } from "@/lib/supabase/types";

type PhotoRow = Database["public"]["Tables"]["vehicle_photo"]["Row"];

export interface PhotoWithUrl extends PhotoRow {
  url: string;
}

const PHOTO_BUCKET = "vehicle-photos";
const SIGNED_URL_TTL = 3600;

export async function withSignedUrls(
  photos: PhotoRow[],
  variant: PhotoVariant = "original",
): Promise<PhotoWithUrl[]> {
  if (photos.length === 0) return [];
  const supabase = await createClient();
  const paths = photos.map((p) => variantPath(p.storage_path, variant));
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL);
  if (error) throw new Error(`signed urls: ${error.message}`);
  const urlByPath = new Map(data.map((d) => [d.path ?? "", d.signedUrl]));
  return photos.map((p) => ({
    ...p,
    url: urlByPath.get(variantPath(p.storage_path, variant)) ?? "",
  }));
}
