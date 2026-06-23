/**
 * Dashboard queries for the LesPAC mirror bot.
 *
 * All shaping/joining lives here so the dashboard page stays thin and this
 * module is fully unit-testable with a mocked Supabase client.
 *
 * Schema notes (cross-checked against 20260622120000_lespac_mirror_bot.sql):
 * - platform_session.health   = 'healthy' | 'needs_reauth' | 'unknown'
 * - bot_event.created_at      = timestamp column (brief calls it 'ts')
 * - bot_event.screenshot_path = dedicated column (NOT nested in detail JSON)
 * - bot_event.outcome         = 'success' | 'failure' | 'skipped' | 'sent'
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBotConfig } from "@/lib/bot/config";
import type { Platform } from "@/lib/bot/types";
import type { PublicationRow } from "@/lib/bot/mirror-state";

// ── Public interfaces ────────────────────────────────────────────────────────

export interface SessionHealth {
  platform: Platform;
  /** Real DB values: 'healthy' | 'needs_reauth' | 'unknown' */
  health: "healthy" | "needs_reauth" | "unknown";
  lastValidatedAt: string | null;
}

export interface ListingBoardRow {
  lespacId: string;
  title: string;
  priceCad: number | null;
  thumbnailUrl: string | null;
  status: "active" | "gone";
  platforms: Record<Platform, { status: PublicationRow["status"]; url: string | null } | null>;
}

export interface AttentionItem {
  kind: "session" | "failed" | "duplicate";
  platform: Platform;
  lespacId: string | null;
  message: string;
  screenshotUrl: string | null;
}

export interface ActivityEntry {
  ts: string;
  lespacId: string | null;
  platform: Platform | null;
  action: string;
  outcome: string;
  detail: string | null;
}

export interface BotDashboardData {
  sessions: SessionHealth[];
  board: ListingBoardRow[];
  attention: AttentionItem[];
  activity: ActivityEntry[];
  lastSyncAt: string | null;
  nextSyncAt: string | null;
}

// ── Private row types (DB snake_case) ────────────────────────────────────────

type SessionRow = {
  platform: string;
  health: string;
  last_validated_at: string | null;
};

type ListingRow = {
  lespac_id: string;
  title: string | null;
  price_cad: number | null;
  photo_urls: string[] | null;
  status: "active" | "gone";
};

type PubRow = {
  lespac_id: string;
  platform: string;
  status: PublicationRow["status"];
  external_url: string | null;
  attempt_count?: number | null;
};

/** bot_event row — note: screenshot_path is a top-level column, not in detail */
type EventRow = {
  created_at: string;
  lespac_id: string | null;
  platform: string | null;
  action: string;
  outcome: string;
  detail: Record<string, unknown> | null;
  screenshot_path: string | null;
};

// ── Constants ────────────────────────────────────────────────────────────────

const ACTIVITY_LIMIT = 50;

// ── Main export ──────────────────────────────────────────────────────────────

export async function fetchBotDashboard(
  client?: SupabaseClient,
): Promise<BotDashboardData> {
  const supabase = client ?? createAdminClient();
  const cfg = await getBotConfig(supabase);

  const [sessRes, listRes, pubRes, evtRes] = await Promise.all([
    supabase
      .from("platform_session")
      .select("platform, health, last_validated_at"),
    supabase
      .from("lespac_listing")
      .select("lespac_id, title, price_cad, photo_urls, status")
      .in("status", ["active", "gone"])
      .order("last_seen", { ascending: false }),
    supabase
      .from("platform_publication")
      .select("lespac_id, platform, status, external_url, attempt_count"),
    supabase
      .from("bot_event")
      .select("created_at, lespac_id, platform, action, outcome, detail, screenshot_path")
      .order("created_at", { ascending: false })
      .limit(ACTIVITY_LIMIT),
  ]);

  const sessRows = (sessRes.data ?? []) as SessionRow[];
  const listRows = (listRes.data ?? []) as ListingRow[];
  const pubRows = (pubRes.data ?? []) as PubRow[];
  const evtRows = (evtRes.data ?? []) as EventRow[];

  // ── Sessions ───────────────────────────────────────────────────────────────

  const sessionByPlatform = new Map(sessRows.map((s) => [s.platform, s]));

  const sessions: SessionHealth[] = cfg.enabledPlatforms.map((platform) => {
    const row = sessionByPlatform.get(platform);
    const health =
      row?.health === "healthy" || row?.health === "needs_reauth"
        ? row.health
        : "unknown";
    return { platform, health, lastValidatedAt: row?.last_validated_at ?? null };
  });

  // ── Board (per-listing with per-platform chips) ────────────────────────────

  const pubByListing = new Map<string, PubRow[]>();
  for (const p of pubRows) {
    const arr = pubByListing.get(p.lespac_id) ?? [];
    arr.push(p);
    pubByListing.set(p.lespac_id, arr);
  }

  const board: ListingBoardRow[] = listRows.map((l) => {
    const chips = cfg.enabledPlatforms.map((platform) => {
      const pub = (pubByListing.get(l.lespac_id) ?? []).find((p) => p.platform === platform);
      return [platform, pub ? { status: pub.status, url: pub.external_url } : null] as const;
    });
    return {
      lespacId: l.lespac_id,
      title: l.title ?? l.lespac_id,
      priceCad: l.price_cad,
      thumbnailUrl: l.photo_urls?.[0] ?? null,
      status: l.status,
      platforms: Object.fromEntries(chips) as ListingBoardRow["platforms"],
    };
  });

  // ── Attention items ────────────────────────────────────────────────────────

  // Index screenshotUrl from bot_event, keyed by "lespacId:platform".
  // Convert stored filesystem path to the dashboard screenshot API URL so the
  // UI can link directly without knowing the server layout.
  const screenshotByKey = new Map<string, string>();
  for (const e of evtRows) {
    if (e.screenshot_path && e.lespac_id && e.platform) {
      const key = `${e.lespac_id}:${e.platform}`;
      if (!screenshotByKey.has(key)) {
        // Derive basename from the stored path (e.g. "/sessions/failures/fb-L1.png" → "fb-L1.png")
        const basename = e.screenshot_path.split("/").pop() ?? e.screenshot_path;
        screenshotByKey.set(key, `/dashboard/bot/screenshot?file=${encodeURIComponent(basename)}`);
      }
    }
  }

  const attention: AttentionItem[] = [];

  // Session attention: needs_reauth means operator must re-authenticate
  for (const s of sessions) {
    if (s.health === "needs_reauth") {
      attention.push({
        kind: "session",
        platform: s.platform,
        lespacId: null,
        message: `Session ${s.platform} expirée — ré-authentification requise`,
        screenshotUrl: null,
      });
    }
  }

  // Failed publication attention (with screenshot when available)
  for (const p of pubRows) {
    if (p.status === "failed") {
      attention.push({
        kind: "failed",
        platform: p.platform as Platform,
        lespacId: p.lespac_id,
        message: `Échec ${p.platform} sur ${p.lespac_id} (${p.attempt_count ?? 0} tentatives)`,
        screenshotUrl: screenshotByKey.get(`${p.lespac_id}:${p.platform}`) ?? null,
      });
    }
  }

  // ── Activity timeline ──────────────────────────────────────────────────────

  const activity: ActivityEntry[] = evtRows.map((e) => ({
    ts: e.created_at,
    lespacId: e.lespac_id,
    platform: (e.platform as Platform | null) ?? null,
    action: e.action,
    outcome: e.outcome,
    detail: e.detail && Object.keys(e.detail).length > 0 ? JSON.stringify(e.detail) : null,
  }));

  // ── Sync times ────────────────────────────────────────────────────────────

  const lastSyncAt = evtRows[0]?.created_at ?? null;
  const nextSyncAt = lastSyncAt
    ? new Date(Date.parse(lastSyncAt) + cfg.syncIntervalSec * 1000).toISOString()
    : null;

  return { sessions, board, attention, activity, lastSyncAt, nextSyncAt };
}
