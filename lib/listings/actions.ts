"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { listingFormSchema, type ListingFormInput } from "./schema";
import { validatePublication, type PublicationError } from "./publication";

const PHOTO_BUCKET = "vehicle-photos";
const MAX_PHOTOS_PER_UNIT = 15;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Non authentifié");
  return { supabase, userId: data.user.id };
}

export async function upsertListing(unit: string, input: ListingFormInput): Promise<void> {
  const parsed = listingFormSchema.parse(input);
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("listing").upsert({
    unit,
    price_cad: parsed.price_cad,
    description_fr: parsed.description_fr,
    channels: parsed.channels,
    updated_by: userId,
  });
  if (error) throw new Error(`upsertListing: ${error.message}`);
  revalidatePath("/inventaire");
  revalidatePath(`/inventaire/${unit}`);
}

export async function togglePublished(
  unit: string,
  next: boolean,
): Promise<{ ok: true } | { ok: false; error: PublicationError }> {
  const { supabase, userId } = await requireUser();

  if (next) {
    const [listingRes, photosRes] = await Promise.all([
      supabase.from("listing").select("price_cad, description_fr").eq("unit", unit).maybeSingle(),
      supabase.from("vehicle_photo").select("is_hero").eq("unit", unit),
    ]);
    if (listingRes.error) throw new Error(`listing fetch: ${listingRes.error.message}`);
    if (photosRes.error) throw new Error(`photos fetch: ${photosRes.error.message}`);

    const err = validatePublication({
      price_cad: listingRes.data?.price_cad ?? 0,
      description_fr: listingRes.data?.description_fr ?? "",
      photos: photosRes.data,
    });
    if (err) return { ok: false, error: err };
  }

  const { error } = await supabase.from("listing").upsert({
    unit,
    is_published: next,
    updated_by: userId,
  });
  if (error) throw new Error(`togglePublished: ${error.message}`);
  revalidatePath("/inventaire");
  revalidatePath(`/inventaire/${unit}`);
  return { ok: true };
}

export async function setHidden(unit: string, hidden: boolean): Promise<void> {
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("listing").upsert({
    unit,
    hidden,
    updated_by: userId,
  });
  if (error) throw new Error(`setHidden: ${error.message}`);
  revalidatePath("/inventaire");
  revalidatePath(`/inventaire/${unit}`);
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
  const { supabase, userId } = await requireUser();

  const [listingsRes, photosRes] = await Promise.all([
    supabase
      .from("listing")
      .select("unit, price_cad, description_fr, is_published, hidden"),
    supabase.from("vehicle_photo").select("unit, is_hero"),
  ]);
  if (listingsRes.error) throw new Error(`listings: ${listingsRes.error.message}`);
  if (photosRes.error) throw new Error(`photos: ${photosRes.error.message}`);

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
  };

  const toPublish: string[] = [];
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
    });
    if (err) {
      reasons[err] += 1;
      skipped += 1;
      continue;
    }
    toPublish.push(l.unit);
  }

  if (toPublish.length > 0) {
    const { error } = await supabase
      .from("listing")
      .update({ is_published: true, updated_by: userId })
      .in("unit", toPublish);
    if (error) throw new Error(`bulk update: ${error.message}`);
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

  const { supabase, userId } = await requireUser();

  const { count, error: countError } = await supabase
    .from("vehicle_photo")
    .select("*", { count: "exact", head: true })
    .eq("unit", unit);
  if (countError) throw new Error(`count: ${countError.message}`);
  if ((count ?? 0) >= MAX_PHOTOS_PER_UNIT) return { ok: false, error: "limit_reached" };

  const ext = (file.name.split(".").pop() || "bin").toLowerCase().slice(0, 8);
  const id = crypto.randomUUID();
  const path = `${unit}/${id}.${ext}`;

  const upload = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type });
  if (upload.error) throw new Error(`storage upload: ${upload.error.message}`);

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
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    throw new Error(`photo insert: ${insertError.message}`);
  }

  revalidatePath(`/inventaire/${unit}`);
  revalidatePath("/inventaire");
  return { ok: true, id };
}

export async function deletePhoto(id: string): Promise<void> {
  const { supabase } = await requireUser();

  const { data: photo, error: fetchError } = await supabase
    .from("vehicle_photo")
    .select("unit, storage_path, is_hero")
    .eq("id", id)
    .single();
  if (fetchError) throw new Error(`fetch: ${fetchError.message}`);

  const { error: delRowError } = await supabase.from("vehicle_photo").delete().eq("id", id);
  if (delRowError) throw new Error(`row delete: ${delRowError.message}`);

  await supabase.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);

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

  revalidatePath(`/inventaire/${photo.unit}`);
  revalidatePath("/inventaire");
}

export async function reorderPhotos(unit: string, orderedIds: string[]): Promise<void> {
  const { supabase } = await requireUser();
  for (let i = 0; i < orderedIds.length; i += 1) {
    const { error } = await supabase
      .from("vehicle_photo")
      .update({ position: i })
      .eq("id", orderedIds[i])
      .eq("unit", unit);
    if (error) throw new Error(`reorder ${orderedIds[i]}: ${error.message}`);
  }
  revalidatePath(`/inventaire/${unit}`);
}

export async function setHero(unit: string, id: string): Promise<void> {
  const { supabase } = await requireUser();
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
  revalidatePath(`/inventaire/${unit}`);
}
