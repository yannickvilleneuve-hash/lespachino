import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

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

/**
 * Fire-and-forget view logger. Ne block jamais le render — on catch et log.
 * Skip les bots (UA détecté) pour ne pas polluer les métriques.
 */
export async function logVehicleView({
  unit,
  userAgent,
  ip,
  referrer,
}: {
  unit: string;
  userAgent: string | null;
  ip: string | null;
  referrer: string | null;
}): Promise<void> {
  if (isBot(userAgent)) return;
  try {
    const admin = createAdminClient();
    await admin.from("view_event").insert({
      unit,
      ip_hash: hashIp(ip),
      user_agent: userAgent?.slice(0, 300) ?? null,
      referrer: referrer?.slice(0, 500) ?? null,
    });
  } catch (err) {
    console.error("logVehicleView failed", err);
  }
}
