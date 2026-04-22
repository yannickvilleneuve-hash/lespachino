"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { listingFormSchema, type ListingFormInput } from "./schema";
import { validatePublication, type PublicationError } from "./publication";

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
