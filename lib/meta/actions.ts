"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listInventoryVehicles } from "@/lib/serti/wgi";
import { logActivity } from "@/lib/audit/log";
import { recordChannelState } from "@/lib/listings/channel-state";
import { normalizeChannels, type Channel } from "@/lib/listings/schema";

const GRAPH_API = "https://graph.facebook.com/v25.0";
const META_CHANNEL: Channel = "fb_marketplace";

export interface BulkMetaFeedResult {
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

export type MetaImportResult =
  | { ok: true; uploadId: string | null }
  | { ok: false; error: string };

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Non authentifié");
  return { userEmail: data.user.email ?? null };
}

export async function addReadyListingsToMetaFeed(): Promise<BulkMetaFeedResult> {
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

  const reasons: BulkMetaFeedResult["reasons"] = {
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
    if (channels.includes(META_CHANNEL)) {
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
    const nextChannels = [...channels, META_CHANNEL];
    const { error } = await admin
      .from("listing")
      .update({ channels: nextChannels, is_published: true })
      .eq("unit", unit);
    if (error) throw new Error(`listing ${unit}: ${error.message}`);
    await recordChannelState(admin, {
      unit,
      channel: META_CHANNEL,
      status: "feed_ready",
      external_url: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/feed/facebook.csv`,
    });
  }

  await logActivity({
    userEmail,
    action: "sync_meta",
    targetType: "feed",
    targetId: "facebook",
    details: { action: "bulk_add_ready", added: units.length, already, skipped, reasons, units },
  });

  revalidatePath("/inventaire");
  revalidatePath("/dashboard/meta");
  return { ok: true, added: units.length, already, skipped, reasons, units };
}

function safeError(text: string): string {
  return text.replace(/EAA[A-Za-z0-9_-]+/g, "[TOKEN]").slice(0, 300);
}

export async function triggerMetaFeedImport(): Promise<MetaImportResult> {
  const { userEmail } = await requireUser();
  const accessToken = process.env.META_ACCESS_TOKEN;
  const feedId = process.env.META_FEED_ID;
  if (!accessToken || !feedId) {
    return { ok: false, error: "META_ACCESS_TOKEN ou META_FEED_ID absent" };
  }
  const feedUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://feeds.hinochicoutimi.com"}/feed/facebook.csv`;
  try {
    const resp = await fetch(`${GRAPH_API}/${feedId}/uploads`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ access_token: accessToken, url: feedUrl }).toString(),
    });
    const text = await resp.text();
    if (!resp.ok) {
      const error = `${resp.status}: ${safeError(text)}`;
      await logActivity({
        userEmail,
        action: "sync_meta",
        targetType: "feed",
        targetId: "facebook",
        details: { action: "error", error },
      });
      return { ok: false, error };
    }
    const body = JSON.parse(text) as { id?: string };
    await logActivity({
      userEmail,
      action: "sync_meta",
      targetType: "feed",
      targetId: "facebook",
      details: { action: "triggered", uploadId: body.id ?? null },
    });
    revalidatePath("/dashboard/meta");
    return { ok: true, uploadId: body.id ?? null };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error: safeError(error) };
  }
}
