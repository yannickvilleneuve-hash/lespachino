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
 * Masquage conservateur de plaque: floute une zone probable en bas-centre.
 * Ce n'est pas une détection OCR parfaite, mais c'est fiable, rapide et sans
 * dépendance externe pour les photos de lot prises de face/arrière.
 */
export async function maskLikelyPlate(input: Buffer): Promise<Buffer> {
  const normalized = await sharp(input).rotate().toBuffer();
  const meta = await sharp(normalized).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 320 || height < 220) return normalized;

  const rectWidth = Math.round(Math.min(width * 0.42, 560));
  const rectHeight = Math.round(Math.max(48, Math.min(height * 0.12, 130)));
  const left = Math.max(0, Math.round((width - rectWidth) / 2));
  const top = Math.max(0, Math.round(height * 0.68 - rectHeight / 2));
  const safeWidth = Math.min(rectWidth, width - left);
  const safeHeight = Math.min(rectHeight, height - top);

  const blurred = await sharp(normalized)
    .extract({ left, top, width: safeWidth, height: safeHeight })
    .blur(28)
    .toBuffer();

  return sharp(normalized)
    .composite([{ input: blurred, left, top }])
    .toBuffer();
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
