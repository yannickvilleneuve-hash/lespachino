import sharp from "sharp";
import path from "node:path";

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

function watermarkEnabled(): boolean {
  return process.env.PHOTO_WATERMARK_DISABLED !== "1";
}

async function resizeWebp(input: Buffer, spec: VariantSpec, watermark: boolean): Promise<Buffer> {
  const resized = await sharp(input)
    .rotate()
    .resize({ width: spec.width, withoutEnlargement: true })
    .webp({ quality: spec.quality })
    .toBuffer();

  if (!watermark || !watermarkEnabled()) return resized;
  const meta = await sharp(resized).metadata();
  if (!meta.width || !meta.height || meta.width < 500) return resized;

  const logoWidth = Math.max(120, Math.round(meta.width * 0.16));
  const logo = await sharp(path.join(process.cwd(), "public/logo1.jpg"))
    .resize({ width: logoWidth, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  return sharp(resized)
    .composite([{ input: logo, gravity: "southeast" }])
    .webp({ quality: spec.quality })
    .toBuffer();
}

/**
 * Génère 2 dérivés WebP à partir d'un buffer image (JPEG/PNG/WebP).
 * - thumb: 400px largeur (admin grid, fiche miniatures, retina mobile cards)
 * - medium: 1200px largeur (fiche image principale, OG meta, feeds externes)
 * Original conservé séparément côté caller.
 */
export async function generateVariants(input: Buffer): Promise<ResizedVariants> {
  const [thumb, medium] = await Promise.all([
    resizeWebp(input, VARIANT_SPECS.thumb, false),
    resizeWebp(input, VARIANT_SPECS.medium, true),
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
