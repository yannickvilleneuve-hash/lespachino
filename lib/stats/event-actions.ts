"use server";

import crypto from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

const ALLOWED_EVENTS = new Set(["photo_select", "photo_open", "engaged_30s", "video_play"]);

function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

function isBot(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return /bot|crawler|spider|scraper|fetch|curl|wget|facebookexternalhit|twitterbot|googlebot|bingbot/.test(
    ua,
  );
}

export async function logPublicVehicleEvent(
  unit: string,
  eventType: "photo_select" | "photo_open" | "engaged_30s" | "video_play",
  metadata: Record<string, Json> = {},
): Promise<void> {
  if (!ALLOWED_EVENTS.has(eventType)) return;
  const hdrs = await headers();
  const userAgent = hdrs.get("user-agent");
  if (isBot(userAgent)) return;
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0].trim() ?? hdrs.get("x-real-ip");
  try {
    await createAdminClient().from("view_event").insert({
      unit,
      event_type: eventType,
      ip_hash: hashIp(ip),
      user_agent: userAgent?.slice(0, 300) ?? null,
      referrer: hdrs.get("referer")?.slice(0, 500) ?? null,
      metadata,
    });
  } catch (err) {
    console.error("logPublicVehicleEvent failed", err);
  }
}
