// Import Lespac manual listings into local listings/photos.
// Usage:
//   node --env-file=.env.local scripts/import-lespac-manual.mjs --plan
//   node --env-file=.env.local scripts/import-lespac-manual.mjs --apply --map=215367806:F4457U
//
// This intentionally imports only explicit mappings. Lespac manual listings do
// not carry our SERTI unit number, and several trucks are ambiguous.

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import * as jt400 from "node-jt400";

const PHOTO_BUCKET = "vehicle-photos";
const MAX_PHOTOS_PER_UNIT = 15;
const DEFAULT_CHANNELS = ["native", "wix", "fb_marketplace", "fb_page", "google_vla", "lespac"];
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const PLAN = args.includes("--plan") || !APPLY;
const PUBLISH = !args.includes("--no-publish");
const REPLACE_PLACEHOLDERS = !args.includes("--keep-placeholders");
const DEACTIVATE = args.includes("--deactivate");
const mappings = new Map();

for (const arg of args) {
  if (!arg.startsWith("--map=")) continue;
  const raw = arg.slice("--map=".length);
  const [id, unit] = raw.split(":");
  if (!id || !unit) throw new Error(`Mapping invalide: ${arg}`);
  mappings.set(Number(id), unit.trim().toUpperCase());
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} manquant`);
  return value;
}

const supabase = createClient(
  requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const lespacBase = (process.env.LESPAC_API_BASE ?? "https://ws.lespac.com").replace(/\/+$/, "");
const lespacToken = requiredEnv("LESPAC_API_TOKEN");

async function lespacFetch(method, path, body) {
  const res = await fetch(`${lespacBase}${path}`, {
    method,
    headers: {
      Authorization: `LPC token="${lespacToken}"`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Lespac ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (res.status === 204 || !ct.includes("json")) return undefined;
  return await res.json();
}

async function listLespac() {
  const res = await lespacFetch("GET", "/sell-api/v1.0/listings");
  return (res ?? []).map((r) => r.listingSummary ?? r);
}

async function getLespac(listingId) {
  return await lespacFetch("GET", `/sell-api/v1.0/listings/${listingId}`);
}

async function deactivateLespac(listingId) {
  return await lespacFetch("PUT", `/sell-api/v1.0/listings/${listingId}/deactivate`);
}

function norm(s) {
  return String(s ?? "").toLowerCase().replace(/[\s\-_.]+/g, "");
}

function rankMatches(detail, candidates) {
  const a = detail.attributes ?? {};
  const make = norm(a["Marque"]);
  const model = norm(a["Modèle"]);
  const year = Number(detail.year ?? 0);
  const km = Number.parseInt(a["Kilométrage"] ?? "0", 10) || 0;

  const scored = [];
  for (const c of candidates) {
    let score = 0;
    const reasons = [];
    if (make && norm(c.make).includes(make)) {
      score += 50;
      reasons.push("marque");
    } else if (make && make.includes(norm(c.make))) {
      score += 45;
      reasons.push("marque partielle");
    }
    if (model && norm(c.model).includes(model)) {
      score += 30;
      reasons.push("modele");
    } else if (model && model.includes(norm(c.model))) {
      score += 25;
      reasons.push("modele partiel");
    }
    if (year > 0 && c.year === year) {
      score += 15;
      reasons.push("annee");
    }
    if (km > 0 && c.km > 0) {
      const delta = Math.abs(c.km - km) / Math.max(c.km, km);
      if (delta <= 0.1) {
        score += 10;
        reasons.push("km 10%");
      } else if (delta <= 0.25) {
        score += 5;
        reasons.push("km 25%");
      }
    }
    if (score > 0) scored.push({ ...c, score, reasons });
  }
  return scored.sort((a, b) => b.score - a.score);
}

async function listInventoryVehicles() {
  const pool = jt400.pool({
    host: requiredEnv("SERTI_DB2_HOST"),
    user: requiredEnv("SERTI_DB2_USER"),
    password: requiredEnv("SERTI_DB2_PASS"),
    naming: "sql",
    maxPoolSize: 2,
  });

  try {
    const rows = await pool.query(`
      SELECT
        WGIUNM AS unit,
        WGIMKE AS make,
        WGIMDL AS model,
        WGIYEA AS year,
        WGIODM AS km,
        WGISTA AS status_raw,
        WGICAT AS category
      FROM SDSFC.WGI
      WHERE WGIAVL='1'
      ORDER BY WGIUNM
    `);
    return rows.map((r) => ({
      unit: String(r.UNIT ?? r.unit ?? "").trim(),
      make: String(r.MAKE ?? r.make ?? "").trim(),
      model: String(r.MODEL ?? r.model ?? "").trim(),
      year: Number(String(r.YEAR ?? r.year ?? "0").trim()) || 0,
      km: Number(String(r.KM ?? r.km ?? "0").trim()) || 0,
      status: String(r.STATUS_RAW ?? r.status_raw ?? "").trim(),
      category: String(r.CATEGORY ?? r.category ?? "").trim(),
    }));
  } finally {
    await pool.close().catch(() => {});
  }
}

function variantPath(originalPath, variant) {
  if (variant === "original") return originalPath;
  const lastDot = originalPath.lastIndexOf(".");
  const base = lastDot === -1 ? originalPath : originalPath.slice(0, lastDot);
  return `${base}_${variant}.webp`;
}

async function generateVariants(input) {
  const thumb = await sharp(input)
    .rotate()
    .resize({ width: 400, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  const mediumBase = await sharp(input)
    .rotate()
    .resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  let medium = mediumBase;
  const meta = await sharp(mediumBase).metadata();
  if (meta.width && meta.height && meta.width >= 500 && process.env.PHOTO_WATERMARK_DISABLED !== "1") {
    const logoWidth = Math.max(120, Math.round(meta.width * 0.16));
    const logo = await sharp("public/logo1.jpg")
      .resize({ width: logoWidth, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    medium = await sharp(mediumBase)
      .composite([{ input: logo, gravity: "southeast" }])
      .webp({ quality: 82 })
      .toBuffer();
  }

  return { thumb, medium };
}

async function removePlaceholderPhotos(unit) {
  const { data, error } = await supabase
    .from("vehicle_photo")
    .select("id, storage_path, uploaded_by")
    .eq("unit", unit);
  if (error) throw new Error(`photos ${unit}: ${error.message}`);
  const photos = data ?? [];
  if (photos.length === 0) return 0;
  if (!photos.every((p) => p.uploaded_by === null)) return 0;

  const paths = photos.flatMap((p) => [
    p.storage_path,
    variantPath(p.storage_path, "thumb"),
    variantPath(p.storage_path, "medium"),
  ]);
  const delRows = await supabase.from("vehicle_photo").delete().eq("unit", unit);
  if (delRows.error) throw new Error(`delete placeholder rows ${unit}: ${delRows.error.message}`);
  await supabase.storage.from(PHOTO_BUCKET).remove(paths);
  return photos.length;
}

async function currentPhotoCount(unit) {
  const { count, error } = await supabase
    .from("vehicle_photo")
    .select("*", { count: "exact", head: true })
    .eq("unit", unit);
  if (error) throw new Error(`count photos ${unit}: ${error.message}`);
  return count ?? 0;
}

async function uploadLespacPhoto(unit, url, position, setHero) {
  const res = await fetch(url);
  if (!res.ok) return false;
  const contentType = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
  if (!ALLOWED_MIME.has(contentType)) return false;

  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const id = crypto.randomUUID();
  const path = `${unit}/${id}.${ext}`;
  const variants = await generateVariants(buffer);
  const thumbPath = variantPath(path, "thumb");
  const mediumPath = variantPath(path, "medium");

  const [origUp, thumbUp, mediumUp] = await Promise.all([
    supabase.storage.from(PHOTO_BUCKET).upload(path, buffer, { contentType }),
    supabase.storage.from(PHOTO_BUCKET).upload(thumbPath, variants.thumb, { contentType: "image/webp" }),
    supabase.storage.from(PHOTO_BUCKET).upload(mediumPath, variants.medium, { contentType: "image/webp" }),
  ]);
  if (origUp.error || thumbUp.error || mediumUp.error) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path, thumbPath, mediumPath]);
    return false;
  }

  const { error } = await supabase.from("vehicle_photo").insert({
    id,
    unit,
    storage_path: path,
    position,
    is_hero: setHero,
  });
  if (error) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path, thumbPath, mediumPath]);
    return false;
  }
  return true;
}

async function importOne(detail, unit) {
  const listingId = detail.listingId;
  const description = String(detail.description ?? "").trim();
  const price = Number(detail.price ?? 0) || 0;

  const upsert = await supabase.from("listing").upsert(
    {
      unit,
      price_cad: price,
      description_fr: description,
      is_published: PUBLISH,
      channels: DEFAULT_CHANNELS,
      hidden: false,
    },
    { onConflict: "unit" },
  );
  if (upsert.error) throw new Error(`upsert listing ${unit}: ${upsert.error.message}`);

  const placeholdersRemoved = REPLACE_PLACEHOLDERS ? await removePlaceholderPhotos(unit) : 0;
  let position = await currentPhotoCount(unit);
  let imported = 0;
  const remaining = Math.max(0, MAX_PHOTOS_PER_UNIT - position);
  for (const url of (detail.imageURLs ?? []).slice(0, remaining)) {
    const ok = await uploadLespacPhoto(unit, url, position, position === 0);
    if (ok) {
      imported += 1;
      position += 1;
    }
  }

  const channel = await supabase.from("listing_channel_state").upsert(
    {
      unit,
      channel: "lespac",
      last_status: "claimed",
      last_synced_at: new Date().toISOString(),
      external_id: String(listingId),
      external_url: detail.listingURL ?? "",
      last_error: null,
    },
    { onConflict: "unit,channel" },
  );
  if (channel.error) throw new Error(`channel state ${unit}: ${channel.error.message}`);

  if (DEACTIVATE) await deactivateLespac(listingId);

  await supabase.from("activity_log").insert({
    user_email: "codex",
    action: "import_lespac",
    target_type: "listing",
    target_id: unit,
    details: {
      listingId,
      photos_imported: imported,
      placeholders_removed: placeholdersRemoved,
      deactivated: DEACTIVATE,
      price,
      source: "scripts/import-lespac-manual.mjs",
    },
  });

  return { unit, listingId, imported, placeholdersRemoved };
}

function shortAttrs(detail) {
  const a = detail.attributes ?? {};
  const chunks = [
    a["Marque"],
    a["Modèle"],
    detail.year,
    a["Kilométrage"] ? `${a["Kilométrage"]}km` : null,
  ].filter(Boolean);
  return chunks.join(" ");
}

const summaries = await listLespac();
const manual = summaries.filter((s) => s.vendorId == null || s.vendorId === "");
const details = [];
for (const s of manual) details.push(await getLespac(s.listingId));

if (PLAN) {
  const candidates = await listInventoryVehicles();
  console.log(`${manual.length} annonces Lespac manuelles. ${mappings.size} mapping(s) explicite(s).\n`);
  for (const detail of details) {
    const mapped = mappings.get(Number(detail.listingId));
    const matches = rankMatches(detail, candidates).slice(0, 4);
    const matchText = matches
      .map((m) => `${m.unit} ${m.year} ${m.make} ${m.model} ${m.km}km [${m.score}: ${m.reasons.join(",")}]`)
      .join(" || ");
    console.log(
      `${mapped ? "*" : "-"} ${detail.listingId} -> ${mapped ?? "(non mappe)"} | ${detail.status} | ${detail.title} | ${shortAttrs(detail)} | ${detail.imageURLs?.length ?? 0} photos`,
    );
    console.log(`  ${matchText || "aucun match"}`);
  }
  if (!APPLY) process.exit(0);
}

if (!APPLY) process.exit(0);
if (mappings.size === 0) throw new Error("Aucun --map fourni pour --apply");

const byId = new Map(details.map((d) => [Number(d.listingId), d]));
let ok = 0;
let fail = 0;
for (const [listingId, unit] of mappings) {
  const detail = byId.get(listingId);
  if (!detail) {
    console.error(`FAIL ${listingId}: detail introuvable`);
    fail += 1;
    continue;
  }
  try {
    const r = await importOne(detail, unit);
    console.log(
      `OK ${r.listingId} -> ${r.unit}: ${r.imported} photo(s), ${r.placeholdersRemoved} placeholder(s) retire(s)`,
    );
    ok += 1;
  } catch (err) {
    console.error(`FAIL ${listingId} -> ${unit}: ${err.message}`);
    fail += 1;
  }
}

console.log(`\nTermine: ${ok} import(s), ${fail} erreur(s).`);
process.exit(fail > 0 ? 1 : 0);
