import type { createAdminClient } from "@/lib/supabase/admin";

type SupabaseLike = ReturnType<typeof createAdminClient>;

const BUCKET = "vehicle-photos";

/**
 * Public URL of a mirrored photo. The bucket is public since migration
 * 20260422160000, so no signed URL is needed.
 */
export function publicPhotoUrl(storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/${BUCKET}/${storagePath}`;
}

function extensionFor(contentType: string, sourceUrl: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  const guess = sourceUrl.split("?")[0].split(".").pop();
  return guess && guess.length <= 4 ? guess : "jpg";
}

/**
 * Copy one LesPAC CDN photo into our own bucket.
 *
 * Hotlinking the CDN works until the ad is deactivated, at which point every
 * image on our site 404s at once. Mirroring also lets next/image optimize them.
 *
 * A failure here is not fatal: the caller keeps `source_url`, so the card still
 * renders from the CDN. Returning null rather than throwing is the point.
 */
export async function mirrorPhoto(
  supabase: SupabaseLike,
  vehicleId: string,
  position: number,
  sourceUrl: string,
): Promise<string | null> {
  let body: ArrayBuffer;
  let contentType: string;
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) return null;
    contentType = res.headers.get("content-type") ?? "image/jpeg";
    body = await res.arrayBuffer();
  } catch {
    return null;
  }

  const path = `catalog/${vehicleId}/${position}.${extensionFor(contentType, sourceUrl)}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType, upsert: true });

  return error ? null : path;
}
