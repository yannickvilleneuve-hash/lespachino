import sharp from "sharp";

export type PhotoVariant = "original" | "medium" | "thumb";

export interface VariantSpec {
  width: number;
  quality: number;
}

export const VARIANT_SPECS: Record<Exclude<PhotoVariant, "original">, VariantSpec> = {
  thumb: { width: 400, quality: 80 },
  medium: { width: 1200, quality: 82 },
};

export interface ResizedVariants {
  thumb: Buffer;
  medium: Buffer;
}

/**
 * Génère 2 dérivés WebP à partir d'un buffer image (JPEG/PNG/WebP).
 * - thumb: 400px largeur (admin grid, fiche miniatures, retina mobile cards)
 * - medium: 1200px largeur (fiche image principale, OG meta, feeds externes)
 * Original conservé séparément côté caller.
 */
export async function generateVariants(input: Buffer): Promise<ResizedVariants> {
  const [thumb, medium] = await Promise.all([
    sharp(input)
      .rotate()
      .resize({ width: VARIANT_SPECS.thumb.width, withoutEnlargement: true })
      .webp({ quality: VARIANT_SPECS.thumb.quality })
      .toBuffer(),
    sharp(input)
      .rotate()
      .resize({ width: VARIANT_SPECS.medium.width, withoutEnlargement: true })
      .webp({ quality: VARIANT_SPECS.medium.quality })
      .toBuffer(),
  ]);
  return { thumb, medium };
}

/**
 * Path d'un variant dérivé du storage_path original.
 * `123/abc.jpg` + "thumb" → `123/abc_thumb.webp`
 * `123/abc.jpg` + "original" → `123/abc.jpg`
 */
export function variantPath(originalPath: string, variant: PhotoVariant): string {
  if (variant === "original") return originalPath;
  const lastDot = originalPath.lastIndexOf(".");
  const base = lastDot === -1 ? originalPath : originalPath.slice(0, lastDot);
  return `${base}_${variant}.webp`;
}
