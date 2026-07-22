import { listOnlineVehicles, photoSrc, type SnapshotVehicle } from "@/lib/catalog/read";
import type { CatalogVehicle } from "@/lib/catalog/types";

/**
 * PURE: le catalogue du snapshot, avec les photos du miroir quand elles existent.
 *
 * Le détail qui compte: le `payload` stocké garde les URLs du CDN LesPAC. En
 * mode dégradé — c'est-à-dire quand LesPAC est justement en panne — servir ces
 * URLs reviendrait à publier un feed d'images mortes. Les copies Supabase, elles,
 * répondent tant que Supabase répond.
 */
export function withMirroredPhotos(rows: SnapshotVehicle[]): CatalogVehicle[] {
  return rows.map((r) =>
    r.photos.length > 0 ? { ...r.vehicle, photoUrls: r.photos.map(photoSrc) } : r.vehicle,
  );
}

/** Le catalogue tel que le snapshot le connaît. Lance si la base est illisible. */
export async function snapshotCatalog(): Promise<CatalogVehicle[]> {
  return withMirroredPhotos(await listOnlineVehicles());
}
