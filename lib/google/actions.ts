"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listInventoryVehicles } from "@/lib/serti/wgi";
import { logActivity } from "@/lib/audit/log";
import { recordChannelState } from "@/lib/listings/channel-state";
import { normalizeChannels, type Channel } from "@/lib/listings/schema";
import { triggerGoogleFeedRefresh } from "./push";

const GOOGLE_CHANNEL: Channel = "google_vla";

export interface BulkGoogleFeedResult {
  ok: true;
  added: number;
  already: number;
  skipped: number;
  reasons: {
    missing_description: number;
    missing_photo: number;
    missing_price: number;
    not_available: number;
    hidden: number;
  };
  units: string[];
}

export type GoogleImportResult =
  | { ok: true; action: "triggered" }
  | { ok: false; error: string };

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Non authentifié");
  return { userEmail: data.user.email ?? null };
}

export async function addReadyListingsToGoogleFeed(): Promise<BulkGoogleFeedResult> {
  const { userEmail } = await requireUser();
  const admin = createAdminClient();
  const [listingsRes, photosRes, vehicles] = await Promise.all([
    admin
      .from("listing")
      .select("unit, price_cad, description_fr, is_published, hidden, channels"),
    admin.from("vehicle_photo").select("unit, is_hero"),
    listInventoryVehicles(),
  ]);
  if (listingsRes.error) throw new Error(`listings: ${listingsRes.error.message}`);
  if (photosRes.error) throw new Error(`photos: ${photosRes.error.message}`);

  const availableUnits = new Set(
    vehicles.filter((v) => v.available && v.status === "available").map((v) => v.unit),
  );
  const photosByUnit = new Map<string, { count: number; hasHero: boolean }>();
  for (const photo of photosRes.data ?? []) {
    const current = photosByUnit.get(photo.unit) ?? { count: 0, hasHero: false };
    current.count += 1;
    current.hasHero = current.hasHero || Boolean(photo.is_hero);
    photosByUnit.set(photo.unit, current);
  }

  const reasons: BulkGoogleFeedResult["reasons"] = {
    missing_description: 0,
    missing_photo: 0,
    missing_price: 0,
    not_available: 0,
    hidden: 0,
  };
  const units: string[] = [];
  let already = 0;
  let skipped = 0;

  for (const listing of listingsRes.data ?? []) {
    const channels = normalizeChannels(listing.channels, []);
    if (channels.includes(GOOGLE_CHANNEL)) {
      already += 1;
      continue;
    }
    if (listing.hidden) {
      reasons.hidden += 1;
      skipped += 1;
      continue;
    }
    if (!availableUnits.has(listing.unit)) {
      reasons.not_available += 1;
      skipped += 1;
      continue;
    }
    if ((listing.description_fr ?? "").trim().length === 0) {
      reasons.missing_description += 1;
      skipped += 1;
      continue;
    }
    const photos = photosByUnit.get(listing.unit);
    if (!photos || photos.count === 0 || !photos.hasHero) {
      reasons.missing_photo += 1;
      skipped += 1;
      continue;
    }
    if ((listing.price_cad ?? 0) <= 0) {
      reasons.missing_price += 1;
      skipped += 1;
      continue;
    }
    units.push(listing.unit);
  }

  for (const unit of units) {
    const listing = listingsRes.data?.find((row) => row.unit === unit);
    const channels = normalizeChannels(listing?.channels, []);
    const nextChannels = [...channels, GOOGLE_CHANNEL];
    const { error } = await admin
      .from("listing")
      .update({ channels: nextChannels, is_published: true })
      .eq("unit", unit);
    if (error) throw new Error(`listing ${unit}: ${error.message}`);
    await recordChannelState(admin, {
      unit,
      channel: GOOGLE_CHANNEL,
      status: "feed_ready",
      external_url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/feed/vehicles.xml`,
    });
  }

  await logActivity({
    userEmail,
    action: "sync_google",
    targetType: "feed",
    targetId: "vehicles",
    details: { action: "bulk_add_ready", added: units.length, already, skipped, reasons, units },
  });

  revalidatePath("/inventaire");
  revalidatePath("/dashboard/google");
  return { ok: true, added: units.length, already, skipped, reasons, units };
}

export async function triggerGoogleVlaImport(): Promise<GoogleImportResult> {
  const { userEmail } = await requireUser();
  const result = await triggerGoogleFeedRefresh();
  await logActivity({
    userEmail,
    action: "sync_google",
    targetType: "feed",
    targetId: "vehicles",
    details: result,
  });
  revalidatePath("/dashboard/google");
  if (result.action === "triggered") return { ok: true, action: "triggered" };
  if (result.action === "skipped") return { ok: false, error: result.reason };
  return { ok: false, error: result.error };
}
