// Test la sync Wix en appelant saveItem sur un des listings publiés.
// Usage: node --env-file=.env.local scripts/test-wix-sync.mjs [unit]
//
// Default: sync TOUT (upsert publiés + remove non-publiés).
// Avec argument unit: sync juste ce unit.

import { createClient } from "@supabase/supabase-js";

const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  WIX_API_TOKEN,
  WIX_SITE_ID,
  WIX_INVENTORY_COLLECTION_ID = "Inventaire",
  NEXT_PUBLIC_SITE_URL = "https://camion-hino.ca",
} = process.env;

if (!WIX_API_TOKEN || !WIX_SITE_ID) {
  console.error("WIX_API_TOKEN et WIX_SITE_ID requis");
  process.exit(1);
}
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Supabase env manquant");
  process.exit(1);
}

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const WIX_API = "https://www.wixapis.com";
const targetUnit = process.argv[2];

function publicPhotoUrl(path) {
  return `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/vehicle-photos/${path}`;
}

function idFromUnit(unit) {
  return unit.replace(/[^A-Za-z0-9_-]/g, "_");
}

function mapState(cat) {
  const c = (cat || "").toUpperCase();
  return c.includes("NEUF") || c.includes("NEUV") ? "NEW" : "USED";
}

async function wixSave(item) {
  const r = await fetch(
    `${WIX_API}/wix-data/v2/items/save?dataCollectionId=${encodeURIComponent(WIX_INVENTORY_COLLECTION_ID)}`,
    {
      method: "POST",
      headers: {
        Authorization: WIX_API_TOKEN,
        "wix-site-id": WIX_SITE_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ dataItem: { id: item._id, data: item } }),
    },
  );
  if (!r.ok) throw new Error(`save ${item._id}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}

async function run() {
  let query = admin.from("listing").select("unit, is_published, hidden");
  if (targetUnit) query = query.eq("unit", targetUnit);
  const { data: listings, error } = await query;
  if (error) throw error;

  console.log(`Found ${listings.length} listing row(s)`);
  for (const l of listings) {
    if (!l.is_published || l.hidden) {
      console.log(`  skip ${l.unit} (not published)`);
      continue;
    }
    // Fetch vehicle details + photos
    const [photosRes] = await Promise.all([
      admin
        .from("vehicle_photo")
        .select("storage_path, is_hero, position")
        .eq("unit", l.unit)
        .order("position"),
    ]);
    if (photosRes.error) throw photosRes.error;
    const photos = photosRes.data;
    if (photos.length === 0) {
      console.log(`  skip ${l.unit} (no photos)`);
      continue;
    }

    const listingDataRes = await admin
      .from("listing")
      .select("*")
      .eq("unit", l.unit)
      .single();
    if (listingDataRes.error) throw listingDataRes.error;
    const listing = listingDataRes.data;

    // Minimal vehicle meta — on évite jt400 ici, juste ce qu'il faut.
    const item = {
      _id: idFromUnit(l.unit),
      title: `Unit ${l.unit}`,
      unit: l.unit,
      vin: "",
      year: null,
      make: "",
      model: "",
      category: "",
      km: 0,
      color: "",
      priceCad: listing.price_cad,
      descriptionFr: listing.description_fr,
      state: mapState(""),
      heroImage: publicPhotoUrl((photos.find((p) => p.is_hero) ?? photos[0]).storage_path),
      imageUrls: photos.map((p) => publicPhotoUrl(p.storage_path)),
      detailUrl: `${NEXT_PUBLIC_SITE_URL}/vehicule/${encodeURIComponent(l.unit)}`,
      dateAdded: null,
    };
    console.log(`  save ${l.unit} (${photos.length} photos, ${listing.price_cad}$)`);
    await wixSave(item);
  }

  console.log("Done.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
