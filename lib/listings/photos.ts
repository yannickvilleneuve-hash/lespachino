import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

type PhotoRow = Database["public"]["Tables"]["vehicle_photo"]["Row"];

export interface PhotoWithUrl extends PhotoRow {
  url: string;
}

const PHOTO_BUCKET = "vehicle-photos";
const SIGNED_URL_TTL = 3600;

export async function withSignedUrls(photos: PhotoRow[]): Promise<PhotoWithUrl[]> {
  if (photos.length === 0) return [];
  const supabase = await createClient();
  const paths = photos.map((p) => p.storage_path);
  const { data, error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL);
  if (error) throw new Error(`signed urls: ${error.message}`);
  const urlByPath = new Map(data.map((d) => [d.path ?? "", d.signedUrl]));
  return photos.map((p) => ({
    ...p,
    url: urlByPath.get(p.storage_path) ?? "",
  }));
}
