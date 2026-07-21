import { createHash } from "node:crypto";
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

  const path = mirrorPath(vehicleId, position, sourceUrl, contentType);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType, upsert: true });

  return error ? null : path;
}

/**
 * Where a mirrored photo lives.
 *
 * The source URL's fingerprint is in the filename on purpose. A path keyed on
 * position alone would be reused when the dealer swaps a photo, and since the
 * public URL would not change, the Next image optimizer would keep serving the
 * old bytes — its cache is keyed by URL, holds for `minimumCacheTTL` (4 h by
 * default), and has no invalidation hook. Fingerprinting makes a new photo a new
 * URL, so the swap is visible immediately.
 */
export function mirrorPath(
  vehicleId: string,
  position: number,
  sourceUrl: string,
  contentType: string,
): string {
  const fingerprint = createHash("sha1").update(sourceUrl).digest("hex").slice(0, 8);
  const ext = extensionFor(contentType, sourceUrl);
  return `catalog/${vehicleId}/${position}-${fingerprint}.${ext}`;
}
