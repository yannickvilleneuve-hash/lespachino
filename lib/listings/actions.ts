"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getVehicleByUnit, listInventoryVehicles } from "@/lib/serti/wgi";
import { listingFormSchema, normalizeChannels, type Channel, type ListingFormInput } from "./schema";
import { validatePublication, type PublicationError } from "./publication";
import { generateVariants, maskLikelyPlate, variantPath } from "@/lib/photos/resize";
import { removeBackgroundWithRemoveBg } from "@/lib/photos/background-removal";
import { logActivity } from "@/lib/audit/log";
import { isWixReady } from "@/lib/wix/config";
import { syncOneToWix } from "@/lib/wix/sync";
import { isLespacReady } from "@/lib/lespac/config";
import { syncOneToLespac } from "@/lib/lespac/sync";
import { triggerMetaFeedRefresh, isMetaPushReady } from "@/lib/meta/push";
import { postVehicleToPage, isPagePostReady } from "@/lib/meta/page";
import { fetchPublicListingByUnit } from "@/lib/listings/public";
import { triggerGoogleFeedRefresh, isGooglePushReady } from "@/lib/google/push";
import { recordChannelState } from "@/lib/listings/channel-state";
import {
  createPublicationJob,
  finishPublicationJob,
  markPublicationJobRunning,
  type PublicationJobAction,
  type PublicationJobStatus,
} from "@/lib/listings/publication-jobs";
import { generateAssistedDescription } from "@/lib/listings/ai-description";
import type { SuggestOptions } from "@/lib/listings/description-templates";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

const PHOTO_BUCKET = "vehicle-photos";
const MAX_PHOTOS_PER_UNIT = 15;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_VIDEO_UPLOAD_BYTES = 300 * 1024 * 1024;
const ALLOWED_VIDEO_MIME = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
]);

const EXTERNAL_CHANNELS: Channel[] = [
  "wix",
  "fb_marketplace",
  "fb_page",
  "google_vla",
  "lespac",
  "kijiji",
];

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

export async function upsertListing(unit: string, input: ListingFormInput): Promise<void> {
  const parsed = listingFormSchema.parse(input);
  const { supabase, userId, userEmail } = await requireUser();
  const previousRes = await supabase
    .from("listing")
    .select("is_published, channels")
    .eq("unit", unit)
    .maybeSingle();
  if (previousRes.error) throw new Error(`listing fetch: ${previousRes.error.message}`);
  const previousChannels = normalizeChannels(previousRes.data?.channels);
  const { error } = await supabase.from("listing").upsert({
    unit,
    price_cad: parsed.price_cad,
    description_fr: parsed.description_fr,
    channels: normalizeChannels(parsed.channels),
    updated_by: userId,
  });
  if (error) throw new Error(`upsertListing: ${error.message}`);
  await logActivity({
    userEmail,
    action: "edit_listing",
    targetType: "listing",
    targetId: unit,
    details: {
      price_cad: parsed.price_cad,
      description_fr: parsed.description_fr,
      channels: parsed.channels,
    },
  });
  if (previousRes.data?.is_published) {
    void autoSyncChannels(
      supabase,
      unit,
      true,
      userEmail,
      normalizeChannels(parsed.channels),
      previousChannels,
    );
  }
  revalidatePath("/inventaire");
  revalidatePath(`/inventaire/${unit}`);
}

export async function generateAssistedListingDescription(
  unit: string,
  options: SuggestOptions,
): Promise<{ ok: true; text: string; source: "openai" | "fallback"; error?: string } | { ok: false; error: string }> {
  const { userEmail } = await requireUser();
  const vehicle = await getVehicleByUnit(unit);
  if (!vehicle) return { ok: false, error: "Véhicule introuvable" };

  const result = await generateAssistedDescription(
    {
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      km: vehicle.km,
      color: vehicle.color,
      category: vehicle.category,
    },
    options,
  );

  await logActivity({
    userEmail,
    action: "generate_description",
    targetType: "listing",
    targetId: unit,
    details: { source: result.source, error: result.error ?? null },
  });
  return { ok: true, text: result.text, source: result.source, error: result.error };
}

export async function togglePublished(
  unit: string,
  next: boolean,
): Promise<{ ok: true } | { ok: false; error: PublicationError }> {
  const { supabase, userId, userEmail } = await requireUser();
  let selectedChannels: Channel[] = [];

  if (next) {
    const [listingRes, photosRes, vehicle] = await Promise.all([
      supabase
        .from("listing")
        .select("price_cad, description_fr, channels")
        .eq("unit", unit)
        .maybeSingle(),
      supabase.from("vehicle_photo").select("is_hero").eq("unit", unit),
      getVehicleByUnit(unit),
    ]);
    if (listingRes.error) throw new Error(`listing fetch: ${listingRes.error.message}`);
    if (photosRes.error) throw new Error(`photos fetch: ${photosRes.error.message}`);
    selectedChannels = normalizeChannels(listingRes.data?.channels);

    const err = validatePublication({
      price_cad: listingRes.data?.price_cad ?? 0,
      description_fr: listingRes.data?.description_fr ?? "",
      photos: photosRes.data,
      available: Boolean(vehicle?.available && vehicle.status === "available"),
    });
    if (err) return { ok: false, error: err };
  } else {
    const listingRes = await supabase
      .from("listing")
      .select("channels")
      .eq("unit", unit)
      .maybeSingle();
    if (listingRes.error) throw new Error(`listing fetch: ${listingRes.error.message}`);
    selectedChannels = normalizeChannels(listingRes.data?.channels);
  }

  const { error } = await supabase.from("listing").upsert({
    unit,
    is_published: next,
    updated_by: userId,
  });
  if (error) throw new Error(`togglePublished: ${error.message}`);
  await logActivity({
    userEmail,
    action: next ? "publish" : "unpublish",
    targetType: "listing",
    targetId: unit,
  });
  // Stamp état du canal natif (le site lui-même).
  await recordChannelState(supabase, {
    unit,
    channel: "native",
    status: next ? (selectedChannels.includes("native") ? "published" : "skipped") : "unpublished",
    error: next && !selectedChannels.includes("native") ? "Canal non sélectionné" : null,
  });
  // Sync auto vers les canaux configurés (best-effort, ne bloque pas la publication).
  void autoSyncChannels(supabase, unit, next, userEmail, selectedChannels, selectedChannels);
  revalidatePath("/inventaire");
  revalidatePath(`/inventaire/${unit}`);
  return { ok: true };
}

type ChannelResult = { action: string; error?: string; reason?: string };

function resultStatus(result: ChannelResult): PublicationJobStatus {
  if (result.action === "error") return "failed";
  if (result.action === "skipped") return "skipped";
  return "succeeded";
}

function resultMessage(result: ChannelResult): string | null {
  return result.error ?? result.reason ?? null;
}

function jobAction(shouldPublish: boolean, channel: Channel): PublicationJobAction {
  if (channel === "fb_page" && shouldPublish) return "post";
  if (channel === "fb_marketplace" || channel === "google_vla") return "refresh";
  return shouldPublish ? "publish" : "unpublish";
}

async function runChannelJob<T extends ChannelResult>(
  supabase: SupabaseClient<Database>,
  unit: string,
  channel: Channel,
  action: PublicationJobAction,
  userEmail: string | null,
  task: () => Promise<T>,
): Promise<T> {
  const jobId = await createPublicationJob(supabase, {
    unit,
    channel,
    action,
    createdByEmail: userEmail,
  });
  await markPublicationJobRunning(supabase, jobId);
  try {
    const result = await task();
    await finishPublicationJob(supabase, jobId, resultStatus(result), resultMessage(result));
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishPublicationJob(supabase, jobId, "failed", msg);
    throw err;
  }
}

async function recordSkipped(
  supabase: SupabaseClient<Database>,
  unit: string,
  channel: Channel,
  reason: string,
): Promise<void> {
  await recordChannelState(supabase, { unit, channel, status: "skipped", error: reason });
}

/**
 * Synchronise les canaux sélectionnés. Les canaux retirés d'un listing déjà
 * publié sont explicitement dépubliés quand le connecteur le supporte.
 */
async function autoSyncChannels(
  supabase: SupabaseClient<Database>,
  unit: string,
  isListingPublished: boolean,
  userEmail: string | null,
  targetChannels: Channel[],
  previousChannels: Channel[],
): Promise<void> {
  const target = new Set(targetChannels);
  const previous = new Set(previousChannels);

  for (const channel of EXTERNAL_CHANNELS) {
    const selected = target.has(channel);
    const wasSelected = previous.has(channel);
    const shouldPublish = isListingPublished && selected;
    if (!shouldPublish && !wasSelected) {
      if (isListingPublished) await recordSkipped(supabase, unit, channel, "Canal non sélectionné");
      continue;
    }

    if (channel === "wix") {
      if (!isWixReady()) {
        await recordSkipped(supabase, unit, channel, "Variables Wix manquantes");
        continue;
      }
      try {
        const result = await runChannelJob(supabase, unit, channel, jobAction(shouldPublish, channel), userEmail, () =>
          syncOneToWix(unit, shouldPublish),
        );
        await logActivity({
          userEmail,
          action: "sync_wix",
          targetType: "listing",
          targetId: unit,
          details: { trigger: "auto", action: result.action, error: result.error },
        });
        await recordChannelState(supabase, {
          unit,
          channel,
          status: result.action,
          error: result.error ?? null,
        });
      } catch (err) {
        const msg = (err as Error).message;
        await logActivity({
          userEmail,
          action: "sync_wix",
          targetType: "listing",
          targetId: unit,
          details: { trigger: "auto", action: "error", error: msg },
        });
        await recordChannelState(supabase, { unit, channel, status: "error", error: msg });
      }
      continue;
    }

    if (channel === "lespac") {
      if (!isLespacReady()) {
        await recordSkipped(supabase, unit, channel, "Variables Lespac manquantes");
        continue;
      }
      try {
        const result = await runChannelJob(supabase, unit, channel, jobAction(shouldPublish, channel), userEmail, () =>
          syncOneToLespac(unit, shouldPublish),
        );
        await logActivity({
          userEmail,
          action: "sync_lespac",
          targetType: "listing",
          targetId: unit,
          details: { trigger: "auto", action: result.action, error: result.error },
        });
        await recordChannelState(supabase, {
          unit,
          channel,
          status: result.action,
          external_id: result.listingId != null ? String(result.listingId) : null,
          error: result.error ?? null,
        });
      } catch (err) {
        const msg = (err as Error).message;
        await logActivity({
          userEmail,
          action: "sync_lespac",
          targetType: "listing",
          targetId: unit,
          details: { trigger: "auto", action: "error", error: msg },
        });
        await recordChannelState(supabase, { unit, channel, status: "error", error: msg });
      }
      continue;
    }

    if (channel === "fb_marketplace") {
      if (!isMetaPushReady()) {
        await recordSkipped(supabase, unit, channel, "Variables Meta feed manquantes");
        continue;
      }
      try {
        const result = await runChannelJob(supabase, unit, channel, "refresh", userEmail, () =>
          triggerMetaFeedRefresh(),
        );
        const errMsg = resultMessage(result);
        await logActivity({
          userEmail,
          action: "sync_meta",
          targetType: "listing",
          targetId: unit,
          details: { trigger: "auto", action: result.action, error: errMsg },
        });
        await recordChannelState(supabase, {
          unit,
          channel,
          status: shouldPublish ? result.action : "unpublished",
          error: errMsg,
        });
      } catch (err) {
        const msg = (err as Error).message;
        await logActivity({
          userEmail,
          action: "sync_meta",
          targetType: "listing",
          targetId: unit,
          details: { trigger: "auto", action: "error", error: msg },
        });
        await recordChannelState(supabase, { unit, channel, status: "error", error: msg });
      }
      continue;
    }

    if (channel === "fb_page") {
      if (!shouldPublish) {
        await recordChannelState(supabase, {
          unit,
          channel,
          status: "unpublished",
          error: "Les posts Facebook déjà créés ne sont pas supprimés automatiquement.",
        });
        continue;
      }
      if (!isPagePostReady()) {
        await recordSkipped(supabase, unit, channel, "Variables Meta Page manquantes");
        continue;
      }
      try {
        const detail = await fetchPublicListingByUnit(unit, { channel: "fb_page" });
        const result = await runChannelJob(supabase, unit, channel, "post", userEmail, () =>
          detail
            ? postVehicleToPage({
                unit: detail.unit,
                year: detail.year,
                make: detail.make,
                model: detail.model,
                category: detail.category,
                km: detail.km,
                price_cad: detail.price_cad,
                hero_url: detail.hero_url,
                description_fr: detail.description_fr,
                detail_url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/vehicule/${encodeURIComponent(unit)}`,
              })
            : Promise.resolve({ action: "skipped", reason: "listing introuvable" } as const),
        );
        const errMsg = resultMessage(result);
        await logActivity({
          userEmail,
          action: "post_fb_page",
          targetType: "listing",
          targetId: unit,
          details: { trigger: "auto", action: result.action, error: errMsg },
        });
        const postId = "postId" in result && typeof result.postId === "string" ? result.postId : null;
        const pageId = process.env.META_PAGE_ID;
        const externalUrl = postId && pageId ? `https://www.facebook.com/${pageId}/posts/${postId}` : null;
        await recordChannelState(supabase, {
          unit,
          channel,
          status: result.action,
          external_id: postId,
          external_url: externalUrl,
          error: errMsg,
        });
      } catch (err) {
        const msg = (err as Error).message;
        await logActivity({
          userEmail,
          action: "post_fb_page",
          targetType: "listing",
          targetId: unit,
          details: { trigger: "auto", action: "error", error: msg },
        });
        await recordChannelState(supabase, { unit, channel, status: "error", error: msg });
      }
      continue;
    }

    if (channel === "google_vla") {
      if (!isGooglePushReady()) {
        await recordSkipped(supabase, unit, channel, "Variables Google Merchant manquantes");
        continue;
      }
      try {
        const result = await runChannelJob(supabase, unit, channel, "refresh", userEmail, () =>
          triggerGoogleFeedRefresh(),
        );
        const errMsg = resultMessage(result);
        await logActivity({
          userEmail,
          action: "sync_google",
          targetType: "listing",
          targetId: unit,
          details: { trigger: "auto", action: result.action, error: errMsg },
        });
        await recordChannelState(supabase, {
          unit,
          channel,
          status: shouldPublish ? result.action : "unpublished",
          error: errMsg,
        });
      } catch (err) {
        const msg = (err as Error).message;
        await logActivity({
          userEmail,
          action: "sync_google",
          targetType: "listing",
          targetId: unit,
          details: { trigger: "auto", action: "error", error: msg },
        });
        await recordChannelState(supabase, { unit, channel, status: "error", error: msg });
      }
      continue;
    }

    await recordSkipped(supabase, unit, channel, "Connecteur Kijiji non configuré");
  }
}

export async function setHidden(unit: string, hidden: boolean): Promise<void> {
  const { supabase, userId, userEmail } = await requireUser();
  const { error } = await supabase.from("listing").upsert({
    unit,
    hidden,
    updated_by: userId,
  });
  if (error) throw new Error(`setHidden: ${error.message}`);
  await logActivity({
    userEmail,
    action: hidden ? "hide_listing" : "show_listing",
    targetType: "listing",
    targetId: unit,
  });
  revalidatePath("/inventaire");
  revalidatePath(`/inventaire/${unit}`);
}

export async function retryPublicationJob(jobId: string): Promise<void> {
  const { supabase, userEmail } = await requireUser();
  const { data: job, error } = await supabase
    .from("publication_job")
    .select("unit, channel, action")
    .eq("id", jobId)
    .single();
  if (error) throw new Error(`publication_job: ${error.message}`);
  const channels = normalizeChannels([job.channel]);
  const shouldPublish = job.action !== "unpublish";
  await autoSyncChannels(supabase, job.unit, shouldPublish, userEmail, channels, channels);
  revalidatePath("/dashboard/publication-jobs");
  revalidatePath("/inventaire");
  revalidatePath(`/inventaire/${job.unit}`);
}

export interface BulkPublishResult {
  published: number;
  skipped: number;
  reasons: Record<PublicationError, number>;
}

/**
 * Passe en bulk tous les listings non-publiés dont la data est complète.
 * Skip ceux qui ne passent pas validatePublication; renvoie le décompte
 * des raisons pour feedback utilisateur.
 */
export async function bulkPublishReady(): Promise<BulkPublishResult> {
  const { supabase, userId, userEmail } = await requireUser();

  const [listingsRes, photosRes, vehicles] = await Promise.all([
    supabase
      .from("listing")
      .select("unit, price_cad, description_fr, is_published, hidden, channels"),
    supabase.from("vehicle_photo").select("unit, is_hero"),
    listInventoryVehicles(),
  ]);
  if (listingsRes.error) throw new Error(`listings: ${listingsRes.error.message}`);
  if (photosRes.error) throw new Error(`photos: ${photosRes.error.message}`);
  const availableUnits = new Set(
    vehicles.filter((v) => v.available && v.status === "available").map((v) => v.unit),
  );

  const photosByUnit = new Map<string, { is_hero: boolean }[]>();
  for (const p of photosRes.data) {
    const arr = photosByUnit.get(p.unit) ?? [];
    arr.push({ is_hero: p.is_hero });
    photosByUnit.set(p.unit, arr);
  }

  const reasons: Record<PublicationError, number> = {
    price_missing: 0,
    description_missing: 0,
    no_photos: 0,
    no_hero: 0,
    not_available: 0,
  };

  const toPublish: string[] = [];
  const channelsByUnit = new Map<string, Channel[]>();
  let skipped = 0;

  for (const l of listingsRes.data) {
    if (l.is_published || l.hidden) {
      skipped += 1;
      continue;
    }
    const err = validatePublication({
      price_cad: l.price_cad,
      description_fr: l.description_fr,
      photos: photosByUnit.get(l.unit) ?? [],
      available: availableUnits.has(l.unit),
    });
    if (err) {
      reasons[err] += 1;
      skipped += 1;
      continue;
    }
    toPublish.push(l.unit);
    channelsByUnit.set(l.unit, normalizeChannels(l.channels));
  }

  if (toPublish.length > 0) {
    const { error } = await supabase
      .from("listing")
      .update({ is_published: true, updated_by: userId })
      .in("unit", toPublish);
    if (error) throw new Error(`bulk update: ${error.message}`);
  }

  await logActivity({
    userEmail,
    action: "bulk_publish",
    targetType: "listing",
    details: {
      published: toPublish.length,
      skipped,
      reasons,
      units: toPublish,
    },
  });
  for (const unit of toPublish) {
    const channels = channelsByUnit.get(unit) ?? normalizeChannels(null);
    await recordChannelState(supabase, {
      unit,
      channel: "native",
      status: channels.includes("native") ? "published" : "skipped",
      error: channels.includes("native") ? null : "Canal non sélectionné",
    });
    void autoSyncChannels(supabase, unit, true, userEmail, channels, channels);
  }
  revalidatePath("/inventaire");
  return { published: toPublish.length, skipped, reasons };
}

export type UploadPhotoResult =
  | { ok: true; id: string }
  | { ok: false; error: "limit_reached" | "invalid_type" | "too_big" | "no_file" };

export async function uploadPhoto(unit: string, formData: FormData): Promise<UploadPhotoResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "no_file" };
  if (!ALLOWED_MIME.has(file.type)) return { ok: false, error: "invalid_type" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "too_big" };

  const { supabase, userId, userEmail } = await requireUser();

  const { count, error: countError } = await supabase
    .from("vehicle_photo")
    .select("*", { count: "exact", head: true })
    .eq("unit", unit);
  if (countError) throw new Error(`count: ${countError.message}`);
  if ((count ?? 0) >= MAX_PHOTOS_PER_UNIT) return { ok: false, error: "limit_reached" };

  const ext = (file.name.split(".").pop() || "bin").toLowerCase().slice(0, 8);
  const id = crypto.randomUUID();
  const path = `${unit}/${id}.${ext}`;

  const rawBuffer = Buffer.from(await file.arrayBuffer());
  const buffer = process.env.PHOTO_PLATE_MASK_AUTO === "1"
    ? await maskLikelyPlate(rawBuffer)
    : rawBuffer;
  let variants;
  try {
    variants = await generateVariants(buffer);
  } catch (err) {
    throw new Error(`resize: ${(err as Error).message}`);
  }
  const thumbPath = variantPath(path, "thumb");
  const mediumPath = variantPath(path, "medium");

  const [origUp, thumbUp, medUp] = await Promise.all([
    supabase.storage.from(PHOTO_BUCKET).upload(path, buffer, { contentType: file.type }),
    supabase.storage
      .from(PHOTO_BUCKET)
      .upload(thumbPath, variants.thumb, { contentType: "image/webp" }),
    supabase.storage
      .from(PHOTO_BUCKET)
      .upload(mediumPath, variants.medium, { contentType: "image/webp" }),
  ]);
  const uploadErr = origUp.error ?? thumbUp.error ?? medUp.error;
  if (uploadErr) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path, thumbPath, mediumPath]);
    throw new Error(`storage upload: ${uploadErr.message}`);
  }

  const isFirst = (count ?? 0) === 0;
  const { error: insertError } = await supabase.from("vehicle_photo").insert({
    id,
    unit,
    storage_path: path,
    position: count ?? 0,
    is_hero: isFirst,
    uploaded_by: userId,
  });
  if (insertError) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path, thumbPath, mediumPath]);
    throw new Error(`photo insert: ${insertError.message}`);
  }

  await logActivity({
    userEmail,
    action: "upload_photo",
    targetType: "photo",
    targetId: id,
    details: { unit, hero: isFirst, size: file.size, type: file.type },
  });
  revalidatePath(`/inventaire/${unit}`);
  revalidatePath("/inventaire");
  return { ok: true, id };
}

type PhotoEditResult =
  | { ok: true }
  | { ok: false; error: "not_found" | "download_failed" | "processing_failed" | "not_configured" };

async function replacePhotoContent(
  supabase: SupabaseClient<Database>,
  storagePath: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const variants = await generateVariants(buffer);
  const thumbPath = variantPath(storagePath, "thumb");
  const mediumPath = variantPath(storagePath, "medium");
  const [origUp, thumbUp, medUp] = await Promise.all([
    supabase.storage.from(PHOTO_BUCKET).upload(storagePath, buffer, {
      contentType,
      upsert: true,
    }),
    supabase.storage.from(PHOTO_BUCKET).upload(thumbPath, variants.thumb, {
      contentType: "image/webp",
      upsert: true,
    }),
    supabase.storage.from(PHOTO_BUCKET).upload(mediumPath, variants.medium, {
      contentType: "image/webp",
      upsert: true,
    }),
  ]);
  const uploadErr = origUp.error ?? thumbUp.error ?? medUp.error;
  if (uploadErr) throw new Error(uploadErr.message);
}

export async function maskPlateOnPhoto(id: string): Promise<PhotoEditResult> {
  const { supabase, userEmail } = await requireUser();
  const { data: photo, error: fetchError } = await supabase
    .from("vehicle_photo")
    .select("unit, storage_path")
    .eq("id", id)
    .single();
  if (fetchError || !photo) return { ok: false, error: "not_found" };

  const dl = await supabase.storage.from(PHOTO_BUCKET).download(photo.storage_path);
  if (dl.error || !dl.data) return { ok: false, error: "download_failed" };

  try {
    const input = Buffer.from(await dl.data.arrayBuffer());
    const masked = await maskLikelyPlate(input);
    await replacePhotoContent(supabase, photo.storage_path, masked, dl.data.type || "image/jpeg");
    await logActivity({
      userEmail,
      action: "mask_plate",
      targetType: "photo",
      targetId: id,
      details: { unit: photo.unit },
    });
    revalidatePath(`/inventaire/${photo.unit}`);
    revalidatePath("/inventaire");
    return { ok: true };
  } catch {
    return { ok: false, error: "processing_failed" };
  }
}

export async function removeBackgroundOnPhoto(id: string): Promise<PhotoEditResult> {
  const { supabase, userEmail } = await requireUser();
  const { data: photo, error: fetchError } = await supabase
    .from("vehicle_photo")
    .select("unit, storage_path")
    .eq("id", id)
    .single();
  if (fetchError || !photo) return { ok: false, error: "not_found" };

  const dl = await supabase.storage.from(PHOTO_BUCKET).download(photo.storage_path);
  if (dl.error || !dl.data) return { ok: false, error: "download_failed" };

  try {
    const input = Buffer.from(await dl.data.arrayBuffer());
    const processed = await removeBackgroundWithRemoveBg(input, photo.storage_path.split("/").pop() ?? "photo.jpg");
    if (!processed.ok) {
      return { ok: false, error: processed.reason === "missing_config" ? "not_configured" : "processing_failed" };
    }
    await replacePhotoContent(supabase, photo.storage_path, processed.buffer, processed.contentType);
    await logActivity({
      userEmail,
      action: "remove_photo_background",
      targetType: "photo",
      targetId: id,
      details: { unit: photo.unit },
    });
    revalidatePath(`/inventaire/${photo.unit}`);
    revalidatePath("/inventaire");
    return { ok: true };
  } catch {
    return { ok: false, error: "processing_failed" };
  }
}

export type UploadVideoResult =
  | { ok: true; url: string }
  | { ok: false; error: "invalid_type" | "too_big" | "no_file" | "missing_public_url" };

export async function uploadWalkaroundVideo(
  unit: string,
  formData: FormData,
): Promise<UploadVideoResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "no_file" };
  if (!ALLOWED_VIDEO_MIME.has(file.type)) return { ok: false, error: "invalid_type" };
  if (file.size > MAX_VIDEO_UPLOAD_BYTES) return { ok: false, error: "too_big" };

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return { ok: false, error: "missing_public_url" };

  const { supabase, userId, userEmail } = await requireUser();
  const ext = (file.name.split(".").pop() || "mp4").toLowerCase().slice(0, 8);
  const path = `${unit}/walkaround-${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, buffer, { contentType: file.type });
  if (uploadError) throw new Error(`video upload: ${uploadError.message}`);

  const url = `${base}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;
  const { error: listingError } = await supabase.from("listing").upsert({
    unit,
    walkaround_video_url: url,
    updated_by: userId,
  });
  if (listingError) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    throw new Error(`listing video: ${listingError.message}`);
  }

  await logActivity({
    userEmail,
    action: "upload_walkaround_video",
    targetType: "listing",
    targetId: unit,
    details: { size: file.size, type: file.type },
  });
  revalidatePath(`/inventaire/${unit}`);
  revalidatePath(`/vehicule/${unit}`);
  return { ok: true, url };
}

export async function clearWalkaroundVideo(unit: string): Promise<void> {
  const { supabase, userId, userEmail } = await requireUser();
  const { error } = await supabase.from("listing").upsert({
    unit,
    walkaround_video_url: null,
    updated_by: userId,
  });
  if (error) throw new Error(`clear video: ${error.message}`);
  await logActivity({
    userEmail,
    action: "clear_walkaround_video",
    targetType: "listing",
    targetId: unit,
  });
  revalidatePath(`/inventaire/${unit}`);
  revalidatePath(`/vehicule/${unit}`);
}

export async function deletePhoto(id: string): Promise<void> {
  const { supabase, userEmail } = await requireUser();

  const { data: photo, error: fetchError } = await supabase
    .from("vehicle_photo")
    .select("unit, storage_path, is_hero")
    .eq("id", id)
    .single();
  if (fetchError) throw new Error(`fetch: ${fetchError.message}`);

  const { error: delRowError } = await supabase.from("vehicle_photo").delete().eq("id", id);
  if (delRowError) throw new Error(`row delete: ${delRowError.message}`);

  await supabase.storage.from(PHOTO_BUCKET).remove([
    photo.storage_path,
    variantPath(photo.storage_path, "thumb"),
    variantPath(photo.storage_path, "medium"),
  ]);

  if (photo.is_hero) {
    const { data: next } = await supabase
      .from("vehicle_photo")
      .select("id")
      .eq("unit", photo.unit)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (next) {
      await supabase.from("vehicle_photo").update({ is_hero: true }).eq("id", next.id);
    }
  }

  await logActivity({
    userEmail,
    action: "delete_photo",
    targetType: "photo",
    targetId: id,
    details: { unit: photo.unit, was_hero: photo.is_hero },
  });
  revalidatePath(`/inventaire/${photo.unit}`);
  revalidatePath("/inventaire");
}

export async function reorderPhotos(unit: string, orderedIds: string[]): Promise<void> {
  const { supabase, userEmail } = await requireUser();
  for (let i = 0; i < orderedIds.length; i += 1) {
    const { error } = await supabase
      .from("vehicle_photo")
      .update({ position: i })
      .eq("id", orderedIds[i])
      .eq("unit", unit);
    if (error) throw new Error(`reorder ${orderedIds[i]}: ${error.message}`);
  }
  await logActivity({
    userEmail,
    action: "reorder_photos",
    targetType: "listing",
    targetId: unit,
    details: { count: orderedIds.length },
  });
  revalidatePath(`/inventaire/${unit}`);
}

export async function setHero(unit: string, id: string): Promise<void> {
  const { supabase, userEmail } = await requireUser();
  const { error: unsetError } = await supabase
    .from("vehicle_photo")
    .update({ is_hero: false })
    .eq("unit", unit);
  if (unsetError) throw new Error(`unset hero: ${unsetError.message}`);
  const { error: setError } = await supabase
    .from("vehicle_photo")
    .update({ is_hero: true })
    .eq("id", id);
  if (setError) throw new Error(`set hero: ${setError.message}`);
  await logActivity({
    userEmail,
    action: "set_hero",
    targetType: "photo",
    targetId: id,
    details: { unit },
  });
  revalidatePath(`/inventaire/${unit}`);
}
