// Seed placeholder photos pour véhicules actifs.
// Usage: node --env-file=.env.local scripts/seed-placeholder-photos.mjs [--limit=10] [--skip-existing]
//
// Génère 3 placeholders par unité via sharp (couleur hashée, texte unit+make+model+année),
// upload dans bucket vehicle-photos via service_role, insert rows vehicle_photo.
// Skip les unités qui ont déjà ≥ 1 photo en DB (sauf --force).

import { createClient } from "@supabase/supabase-js";
import * as jt400 from "node-jt400";
import sharp from "sharp";

const BUCKET = "vehicle-photos";
const LABELS = ["Extérieur 1/3", "Extérieur 2/3", "Intérieur 3/3"];

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.includes("=") ? a.split("=") : [a, "true"];
    return [k.replace(/^--/, ""), v];
  }),
);
const LIMIT = Number(args.get("limit") ?? "10");
const FORCE = args.get("force") === "true";

function hashColor(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  // saturated but not too bright — readable white text on top
  return { r: hslToRgb(hue, 50, 35).r, g: hslToRgb(hue, 50, 35).g, b: hslToRgb(hue, 50, 35).b };
}
function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

async function makeImage({ unit, make, model, year, label, bg }) {
  const W = 1200, H = 800;
  const safeUnit = escapeXml(unit);
  const safeMake = escapeXml(make);
  const safeModel = escapeXml(model);
  const safeLabel = escapeXml(label);
  const safeYear = escapeXml(String(year || ""));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="100%" height="100%" fill="rgb(${bg.r},${bg.g},${bg.b})"/>
  <g fill="rgba(255,255,255,0.15)">
    <circle cx="${W * 0.8}" cy="${H * 0.3}" r="200"/>
    <circle cx="${W * 0.2}" cy="${H * 0.9}" r="280"/>
  </g>
  <text x="50%" y="25%" dominant-baseline="middle" text-anchor="middle"
        font-family="Arial,Helvetica,sans-serif" font-size="96" font-weight="900" fill="#fff">
    ${safeUnit}
  </text>
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
        font-family="Arial,Helvetica,sans-serif" font-size="64" font-weight="700" fill="rgba(255,255,255,0.9)">
    ${safeMake} ${safeModel}
  </text>
  <text x="50%" y="65%" dominant-baseline="middle" text-anchor="middle"
        font-family="Arial,Helvetica,sans-serif" font-size="48" fill="rgba(255,255,255,0.75)">
    ${safeYear}
  </text>
  <text x="50%" y="85%" dominant-baseline="middle" text-anchor="middle"
        font-family="Arial,Helvetica,sans-serif" font-size="36" fill="rgba(255,255,255,0.7)">
    ${safeLabel}
  </text>
  <text x="50%" y="94%" dominant-baseline="middle" text-anchor="middle"
        font-family="Arial,Helvetica,sans-serif" font-size="22" fill="rgba(255,255,255,0.5)">
    PLACEHOLDER — à remplacer
  </text>
</svg>`;
  return await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function main() {
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SERTI_DB2_HOST, SERTI_DB2_USER, SERTI_DB2_PASS } = process.env;
  if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase env manquant");
  if (!SERTI_DB2_HOST || !SERTI_DB2_USER || !SERTI_DB2_PASS) throw new Error("SERTI env manquant");

  const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const pool = jt400.pool({
    host: SERTI_DB2_HOST,
    user: SERTI_DB2_USER,
    password: SERTI_DB2_PASS,
    naming: "sql",
    maxPoolSize: 2,
  });

  const rows = await pool.query(
    `SELECT WGIUNM, WGIMKE, WGIMDL, WGIYEA FROM SDSFC.WGI WHERE WGISTA='A' ORDER BY WGIUNM FETCH FIRST ${LIMIT} ROWS ONLY`,
  );
  console.log(`SERTI: ${rows.length} unités actives à traiter`);

  const units = rows.map((r) => ({
    unit: String(r.WGIUNM).trim(),
    make: String(r.WGIMKE).trim(),
    model: String(r.WGIMDL).trim(),
    year: String(r.WGIYEA).trim(),
  }));

  let created = 0, skipped = 0;
  for (const v of units) {
    if (!FORCE) {
      const { count } = await admin
        .from("vehicle_photo")
        .select("*", { count: "exact", head: true })
        .eq("unit", v.unit);
      if ((count ?? 0) > 0) {
        console.log(`  ${v.unit}  (skip, déjà ${count} photo(s))`);
        skipped += 1;
        continue;
      }
    }

    const bg = hashColor(v.unit);
    let successCount = 0;
    for (let i = 0; i < LABELS.length; i += 1) {
      const label = LABELS[i];
      const buf = await makeImage({ ...v, label, bg });
      const id = crypto.randomUUID();
      const path = `${v.unit}/${id}.jpg`;
      const up = await admin.storage.from(BUCKET).upload(path, buf, {
        contentType: "image/jpeg",
      });
      if (up.error) {
        console.error(`  ${v.unit} #${i + 1} upload: ${up.error.message}`);
        continue;
      }
      const ins = await admin.from("vehicle_photo").insert({
        id,
        unit: v.unit,
        storage_path: path,
        position: i,
        is_hero: i === 0,
      });
      if (ins.error) {
        await admin.storage.from(BUCKET).remove([path]);
        console.error(`  ${v.unit} #${i + 1} insert: ${ins.error.message}`);
        continue;
      }
      successCount += 1;
    }
    console.log(`  ${v.unit}  ${v.make} ${v.model}   ${successCount}/3 photos`);
    if (successCount > 0) created += 1;
  }

  await pool.close();
  console.log(`\nTerminé: ${created} unités seed, ${skipped} déjà présentes.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
