"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { generateVariants, variantPath } from "@/lib/photos/resize";
import { logActivity } from "@/lib/audit/log";
import { DEFAULT_CHANNELS } from "@/lib/listings/schema";
import {
  listAll,
  getByListingId,
  deactivateByListingId,
} from "@/lib/lespac/client";
import { isManual, rankSertiMatches, type SertiCandidate, type MatchScore } from "@/lib/lespac/import";
import { listInventoryVehicles } from "@/lib/serti/wgi";
import type { LespacListing } from "@/lib/lespac/types";

const PHOTO_BUCKET = "vehicle-photos";
const MAX_PHOTOS_PER_UNIT = 15;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Non authentifié");
  return {
    supabase,
    userId: data.user.id,
    userEmail: data.user.email ?? null,
  };
}

export type ResolvedLespacListing = LespacListing & { listingId: number };

export interface LespacImportRow {
  detail: ResolvedLespacListing;
  matches: MatchScore[];
  /** unit déjà claimée localement via listing_channel_state.lespac */
  already_claimed_by: string | null;
}

export interface LespacImportContext {
  rows: LespacImportRow[];
  candidates: SertiCandidate[];
}

/** Charge toutes les annonces Lespac manuelles avec détails complets +
 *  candidats SERTI + matches pré-calculés. */
export async function getLespacImportContext(): Promise<LespacImportContext> {
  const { supabase } = await requireUser();

  const [summaries, vehicles, claimsRes] = await Promise.all([
    listAll(),
    listInventoryVehicles(),
    supabase
      .from("listing_channel_state")
      .select("unit, external_id")
      .eq("channel", "lespac"),
  ]);

  const manual = summaries.filter(isManual);
  const details = await Promise.all(
    manual.map((s) => getByListingId(s.listingId).catch(() => null)),
  );

  const candidates: SertiCandidate[] = vehicles.map((v) => ({
    unit: v.unit,
    make: v.make,
    model: v.model,
    year: v.year,
    km: v.km,
    status: v.status,
  }));

  const claimByExtId = new Map<string, string>();
  for (const c of claimsRes.data ?? []) {
    if (c.external_id) claimByExtId.set(c.external_id, c.unit);
  }

  const rows: LespacImportRow[] = [];
  for (let i = 0; i < manual.length; i += 1) {
    const detail = details[i];
    if (!detail || detail.listingId == null) continue;
    const resolved = detail as ResolvedLespacListing;
    rows.push({
      detail: resolved,
      matches: rankSertiMatches(resolved, candidates).slice(0, 5),
      already_claimed_by: claimByExtId.get(String(resolved.listingId)) ?? null,
    });
  }
  return { rows, candidates };
}

export interface ImportOptions {
  /** Télécharger et uploader les photos Lespac vers notre bucket. */
  import_photos: boolean;
  /** Désactiver l'annonce manuelle Lespac après import (on republie via API). */
  deactivate_manual: boolean;
  /** Marquer is_published=true. Default true. */
  publish: boolean;
}

export interface ImportResult {
  ok: true;
  unit: string;
  photos_imported: number;
  deactivated: boolean;
}

async function downloadAndUpload(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unit: string,
  url: string,
  position: number,
  setHero: boolean,
  userId: string,
): Promise<boolean> {
  const res = await fetch(url);
  if (!res.ok) return false;
  const ct = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
  if (!ALLOWED_MIME.has(ct)) return false;

  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = ct === "image/png" ? "png" : ct === "image/webp" ? "webp" : "jpg";
  const id = crypto.randomUUID();
  const path = `${unit}/${id}.${ext}`;
  const thumbPath = variantPath(path, "thumb");
  const mediumPath = variantPath(path, "medium");

  let variants;
  try {
    variants = await generateVariants(buffer);
  } catch {
    return false;
  }

  const [origUp, thumbUp, medUp] = await Promise.all([
    supabase.storage.from(PHOTO_BUCKET).upload(path, buffer, { contentType: ct }),
    supabase.storage.from(PHOTO_BUCKET).upload(thumbPath, variants.thumb, { contentType: "image/webp" }),
    supabase.storage.from(PHOTO_BUCKET).upload(mediumPath, variants.medium, { contentType: "image/webp" }),
  ]);
  if (origUp.error || thumbUp.error || medUp.error) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path, thumbPath, mediumPath]);
    return false;
  }

  const { error: insertError } = await supabase.from("vehicle_photo").insert({
    id,
    unit,
    storage_path: path,
    position,
    is_hero: setHero,
    uploaded_by: userId,
  });
  if (insertError) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path, thumbPath, mediumPath]);
    return false;
  }
  return true;
}

/** Importe une annonce Lespac manuelle vers le listing local d'une unit. */
export async function importLespacListing(
  listingId: number,
  unit: string,
  opts: ImportOptions,
): Promise<ImportResult> {
  const { supabase, userId, userEmail } = await requireUser();

  const detail = await getByListingId(listingId);
  if (!detail || detail.listingId == null)
    throw new Error(`Annonce Lespac ${listingId} introuvable`);
  const resolvedListingId: number = detail.listingId;

  // Upsert listing local — écrase price + description avec les valeurs Lespac.
  const description = (detail.description ?? "").trim();
  const price = Number(detail.price ?? 0) || 0;
  const channels = DEFAULT_CHANNELS;
  const { error: upsertErr } = await supabase
    .from("listing")
    .upsert(
      {
        unit,
        price_cad: price,
        description_fr: description,
        is_published: opts.publish,
        channels,
        hidden: false,
        updated_by: userId,
      },
      { onConflict: "unit" },
    );
  if (upsertErr) throw new Error(`upsert listing: ${upsertErr.message}`);

  // Photos (best-effort). Cap au max global, et n'écrase pas les photos
  // déjà présentes — append à la suite.
  let photosImported = 0;
  if (opts.import_photos && (detail.imageURLs?.length ?? 0) > 0) {
    const { count } = await supabase
      .from("vehicle_photo")
      .select("*", { count: "exact", head: true })
      .eq("unit", unit);
    let position = count ?? 0;
    const remaining = Math.max(0, MAX_PHOTOS_PER_UNIT - position);
    const urls = (detail.imageURLs ?? []).slice(0, remaining);
    for (const url of urls) {
      const setHero = position === 0;
      const ok = await downloadAndUpload(supabase, unit, url, position, setHero, userId);
      if (ok) {
        photosImported += 1;
        position += 1;
      }
    }
  }

  // Désactive l'annonce manuelle Lespac (on republiera via vendorId).
  let deactivated = false;
  if (opts.deactivate_manual) {
    try {
      await deactivateByListingId(resolvedListingId);
      deactivated = true;
    } catch (err) {
      // Best-effort: log mais n'échoue pas l'import.
      console.error(`deactivateByListingId ${resolvedListingId}:`, (err as Error).message);
    }
  }

  await logActivity({
    userEmail,
    action: "import_lespac",
    targetType: "listing",
    targetId: unit,
    details: {
      listingId: resolvedListingId,
      photos_imported: photosImported,
      deactivated,
      price,
    },
  });

  revalidatePath("/inventaire");
  revalidatePath(`/inventaire/${unit}`);
  revalidatePath("/inventaire/import-lespac");
  return { ok: true, unit, photos_imported: photosImported, deactivated };
}
