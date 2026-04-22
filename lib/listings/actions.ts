"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { listingFormSchema, type ListingFormInput } from "./schema";
import { validatePublication, type PublicationError } from "./publication";

const PHOTO_BUCKET = "vehicle-photos";
const MAX_PHOTOS_PER_VIN = 15;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Non authentifié");
  return { supabase, userId: data.user.id };
}

export async function upsertListing(vin: string, input: ListingFormInput): Promise<void> {
  const parsed = listingFormSchema.parse(input);
  const { supabase, userId } = await requireUser();
  const { error } = await supabase.from("listing").upsert({
    vin,
    price_cad: parsed.price_cad,
    description_fr: parsed.description_fr,
    channels: parsed.channels,
    updated_by: userId,
  });
  if (error) throw new Error(`upsertListing: ${error.message}`);
  revalidatePath("/inventaire");
  revalidatePath(`/inventaire/${vin}`);
}

export async function togglePublished(
  vin: string,
  next: boolean,
): Promise<{ ok: true } | { ok: false; error: PublicationError }> {
  const { supabase, userId } = await requireUser();

  if (next) {
    const [listingRes, photosRes] = await Promise.all([
      supabase.from("listing").select("price_cad, description_fr").eq("vin", vin).maybeSingle(),
      supabase.from("vehicle_photo").select("is_hero").eq("vin", vin),
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
    vin,
    is_published: next,
    updated_by: userId,
  });
  if (error) throw new Error(`togglePublished: ${error.message}`);
  revalidatePath("/inventaire");
  revalidatePath(`/inventaire/${vin}`);
  return { ok: true };
}

export type UploadPhotoResult =
  | { ok: true; id: string }
  | { ok: false; error: "limit_reached" | "invalid_type" | "too_big" | "no_file" };

export async function uploadPhoto(vin: string, formData: FormData): Promise<UploadPhotoResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "no_file" };
  if (!ALLOWED_MIME.has(file.type)) return { ok: false, error: "invalid_type" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "too_big" };

  const { supabase, userId } = await requireUser();

  const { count, error: countError } = await supabase
    .from("vehicle_photo")
    .select("*", { count: "exact", head: true })
    .eq("vin", vin);
  if (countError) throw new Error(`count: ${countError.message}`);
  if ((count ?? 0) >= MAX_PHOTOS_PER_VIN) return { ok: false, error: "limit_reached" };

  const ext = (file.name.split(".").pop() || "bin").toLowerCase().slice(0, 8);
  const id = crypto.randomUUID();
  const path = `${vin}/${id}.${ext}`;

  const upload = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, { contentType: file.type });
  if (upload.error) throw new Error(`storage upload: ${upload.error.message}`);

  const isFirst = (count ?? 0) === 0;
  const { error: insertError } = await supabase.from("vehicle_photo").insert({
    id,
    vin,
    storage_path: path,
    position: count ?? 0,
    is_hero: isFirst,
    uploaded_by: userId,
  });
  if (insertError) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    throw new Error(`photo insert: ${insertError.message}`);
  }

  revalidatePath(`/inventaire/${vin}`);
  revalidatePath("/inventaire");
  return { ok: true, id };
}

export async function deletePhoto(id: string): Promise<void> {
  const { supabase } = await requireUser();

  const { data: photo, error: fetchError } = await supabase
    .from("vehicle_photo")
    .select("vin, storage_path, is_hero")
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
      .eq("vin", photo.vin)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (next) {
      await supabase.from("vehicle_photo").update({ is_hero: true }).eq("id", next.id);
    }
  }

  revalidatePath(`/inventaire/${photo.vin}`);
  revalidatePath("/inventaire");
}

export async function reorderPhotos(vin: string, orderedIds: string[]): Promise<void> {
  const { supabase } = await requireUser();
  for (let i = 0; i < orderedIds.length; i += 1) {
    const { error } = await supabase
      .from("vehicle_photo")
      .update({ position: i })
      .eq("id", orderedIds[i])
      .eq("vin", vin);
    if (error) throw new Error(`reorder ${orderedIds[i]}: ${error.message}`);
  }
  revalidatePath(`/inventaire/${vin}`);
}

export async function setHero(vin: string, id: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error: unsetError } = await supabase
    .from("vehicle_photo")
    .update({ is_hero: false })
    .eq("vin", vin);
  if (unsetError) throw new Error(`unset hero: ${unsetError.message}`);
  const { error: setError } = await supabase
    .from("vehicle_photo")
    .update({ is_hero: true })
    .eq("id", id);
  if (setError) throw new Error(`set hero: ${setError.message}`);
  revalidatePath(`/inventaire/${vin}`);
}
