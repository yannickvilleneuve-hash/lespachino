// Backfill thumb + medium variants pour photos déjà uploadées.
// Usage:
//   node --env-file=.env.local scripts/resize-existing-photos.mjs [--force]
//
// Pour chaque vehicle_photo:
//   1. download original
//   2. génère thumb (400px) + medium (1200px) WebP
//   3. upload aux paths {unit}/{photo_id}_thumb.webp et _medium.webp
//   4. skip si variant existe déjà (sauf --force)

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const BUCKET = "vehicle-photos";
const VARIANTS = {
  thumb: { width: 400, quality: 80 },
  medium: { width: 1200, quality: 82 },
};

const args = new Set(process.argv.slice(2));
const FORCE = args.has("--force");

function variantPath(originalPath, variant) {
  if (variant === "original") return originalPath;
  const lastDot = originalPath.lastIndexOf(".");
  const base = lastDot === -1 ? originalPath : originalPath.slice(0, lastDot);
  return `${base}_${variant}.webp`;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY requis");
  process.exit(1);
}

const supabase = createClient(url, key);

const { data: photos, error } = await supabase
  .from("vehicle_photo")
  .select("id, unit, storage_path")
  .order("unit");
if (error) {
  console.error(`fetch photos: ${error.message}`);
  process.exit(1);
}

console.log(`${photos.length} photos à traiter${FORCE ? " (--force)" : ""}.`);

// Cache des fichiers existants par unit pour éviter list() par photo.
const existingByUnit = new Map();
async function unitFiles(unit) {
  if (existingByUnit.has(unit)) return existingByUnit.get(unit);
  const { data, error: e } = await supabase.storage.from(BUCKET).list(unit, { limit: 1000 });
  if (e) throw new Error(`list ${unit}: ${e.message}`);
  const set = new Set(data.map((d) => d.name));
  existingByUnit.set(unit, set);
  return set;
}

let done = 0;
let skipped = 0;
let errors = 0;

for (const p of photos) {
  const thumbPath = variantPath(p.storage_path, "thumb");
  const medPath = variantPath(p.storage_path, "medium");
  const thumbName = thumbPath.split("/").pop();
  const medName = medPath.split("/").pop();
  const existing = await unitFiles(p.unit);

  const needThumb = FORCE || !existing.has(thumbName);
  const needMed = FORCE || !existing.has(medName);
  if (!needThumb && !needMed) {
    skipped += 1;
    continue;
  }

  try {
    const dl = await supabase.storage.from(BUCKET).download(p.storage_path);
    if (dl.error) throw new Error(`download: ${dl.error.message}`);
    const buf = Buffer.from(await dl.data.arrayBuffer());

    if (needThumb) {
      const out = await sharp(buf)
        .rotate()
        .resize({ width: VARIANTS.thumb.width, withoutEnlargement: true })
        .webp({ quality: VARIANTS.thumb.quality })
        .toBuffer();
      const up = await supabase.storage
        .from(BUCKET)
        .upload(thumbPath, out, { contentType: "image/webp", upsert: true });
      if (up.error) throw new Error(`upload thumb: ${up.error.message}`);
    }
    if (needMed) {
      const out = await sharp(buf)
        .rotate()
        .resize({ width: VARIANTS.medium.width, withoutEnlargement: true })
        .webp({ quality: VARIANTS.medium.quality })
        .toBuffer();
      const up = await supabase.storage
        .from(BUCKET)
        .upload(medPath, out, { contentType: "image/webp", upsert: true });
      if (up.error) throw new Error(`upload medium: ${up.error.message}`);
    }
    done += 1;
    if (done % 10 === 0) console.log(`  ... ${done} photos OK`);
  } catch (err) {
    errors += 1;
    console.error(`  ✗ ${p.unit}/${p.id}: ${err.message}`);
  }
}

console.log(`\nTerminé: ${done} générées, ${skipped} déjà OK, ${errors} erreurs.`);
process.exit(errors > 0 ? 1 : 0);
