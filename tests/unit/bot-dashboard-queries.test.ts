import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/bot/config", () => ({
  loadBotConfig: () => ({ enabledPlatforms: ["facebook", "kijiji"], syncIntervalSec: 3600 }),
}));

// Must import AFTER vi.mock
import { fetchBotDashboard } from "@/lib/bot/dashboard-queries";

/**
 * Minimal Supabase mock.
 * Each call to from(table) returns a builder whose terminal awaiting resolves
 * to { data: rows, error: null }.  The builder chains eq / in / order / limit
 * back to itself so fluent chains typecheck and work.
 */
function makeSupabase(tables: Record<string, unknown[]>) {
  function builder(table: string) {
    const rows = tables[table] ?? [];
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit"]) {
      b[m] = vi.fn(() => b);
    }
    (b as { then: unknown }).then = (res: (v: unknown) => unknown) =>
      res({ data: rows, error: null });
    return b;
  }
  return { from: vi.fn((t: string) => builder(t)) } as never;
}

beforeEach(() => vi.clearAllMocks());

describe("fetchBotDashboard", () => {
  it("shapes sessions with real health values (healthy / needs_reauth / unknown)", async () => {
    const supabase = makeSupabase({
      platform_session: [
        {
          platform: "facebook",
          health: "needs_reauth",
          last_validated_at: "2026-06-22T10:00:00Z",
        },
        { platform: "kijiji", health: "healthy", last_validated_at: "2026-06-22T09:00:00Z" },
      ],
      lespac_listing: [],
      platform_publication: [],
      bot_event: [],
    });

    const data = await fetchBotDashboard(supabase);

    expect(data.sessions).toEqual([
      {
        platform: "facebook",
        health: "needs_reauth",
        lastValidatedAt: "2026-06-22T10:00:00Z",
      },
      { platform: "kijiji", health: "healthy", lastValidatedAt: "2026-06-22T09:00:00Z" },
    ]);
  });

  it("returns unknown health for a platform missing a session row", async () => {
    const supabase = makeSupabase({
      platform_session: [
        { platform: "facebook", health: "healthy", last_validated_at: "2026-06-22T10:00:00Z" },
      ],
      lespac_listing: [],
      platform_publication: [],
      bot_event: [],
    });

    const data = await fetchBotDashboard(supabase);

    expect(data.sessions.find((s) => s.platform === "kijiji")).toEqual({
      platform: "kijiji",
      health: "unknown",
      lastValidatedAt: null,
    });
  });

  it("shapes board rows: snake→camel, thumbnail = first photo_url, per-platform chips", async () => {
    const supabase = makeSupabase({
      platform_session: [],
      lespac_listing: [
        {
          lespac_id: "L1",
          title: "Hino 268",
          price_cad: 90000,
          photo_urls: ["https://cdn/p.jpg", "https://cdn/q.jpg"],
          status: "active",
        },
      ],
      platform_publication: [
        {
          lespac_id: "L1",
          platform: "facebook",
          status: "failed",
          external_url: null,
          attempt_count: 3,
        },
        {
          lespac_id: "L1",
          platform: "kijiji",
          status: "live",
          external_url: "https://www.kijiji.ca/v-camions/1",
        },
      ],
      bot_event: [],
    });

    const data = await fetchBotDashboard(supabase);

    expect(data.board).toHaveLength(1);
    const row = data.board[0];
    expect(row.lespacId).toBe("L1");
    expect(row.title).toBe("Hino 268");
    expect(row.priceCad).toBe(90000);
    expect(row.thumbnailUrl).toBe("https://cdn/p.jpg");
    expect(row.status).toBe("active");
    expect(row.platforms.facebook).toEqual({ status: "failed", url: null });
    expect(row.platforms.kijiji).toEqual({
      status: "live",
      url: "https://www.kijiji.ca/v-camions/1",
    });
  });

  it("sets null chip for platform with no publication row", async () => {
    const supabase = makeSupabase({
      platform_session: [],
      lespac_listing: [
        {
          lespac_id: "L2",
          title: "Hino 195",
          price_cad: null,
          photo_urls: [],
          status: "active",
        },
      ],
      platform_publication: [], // no publications at all
      bot_event: [],
    });

    const data = await fetchBotDashboard(supabase);

    expect(data.board[0].platforms.facebook).toBeNull();
    expect(data.board[0].platforms.kijiji).toBeNull();
    expect(data.board[0].thumbnailUrl).toBeNull();
  });

  it("builds attention items: needs_reauth session + failed publication", async () => {
    const supabase = makeSupabase({
      platform_session: [
        {
          platform: "facebook",
          health: "needs_reauth",
          last_validated_at: "2026-06-22T10:00:00Z",
        },
      ],
      lespac_listing: [
        {
          lespac_id: "L1",
          title: "Hino",
          price_cad: 80000,
          photo_urls: [],
          status: "active",
        },
      ],
      platform_publication: [
        {
          lespac_id: "L1",
          platform: "facebook",
          status: "failed",
          external_url: null,
          attempt_count: 2,
        },
      ],
      // screenshot_path is a direct column on bot_event
      bot_event: [
        {
          created_at: "2026-06-22T11:00:00Z",
          lespac_id: "L1",
          platform: "facebook",
          action: "create",
          outcome: "failure",
          detail: {},
          screenshot_path: "/screenshots/fb-L1.png",
        },
      ],
    });

    const data = await fetchBotDashboard(supabase);

    // Dead session attention item (needs_reauth → session attention)
    expect(data.attention.some((a) => a.kind === "session" && a.platform === "facebook")).toBe(
      true,
    );

    // Failed publication attention item with screenshot from bot_event.screenshot_path
    const failed = data.attention.find((a) => a.kind === "failed" && a.lespacId === "L1");
    expect(failed).toBeDefined();
    expect(failed?.platform).toBe("facebook");
    expect(failed?.screenshotUrl).toContain("fb-L1.png");
  });

  it("maps bot_event rows to activity entries (created_at → ts)", async () => {
    const supabase = makeSupabase({
      platform_session: [],
      lespac_listing: [],
      platform_publication: [],
      bot_event: [
        {
          created_at: "2026-06-22T11:30:00Z",
          lespac_id: "L1",
          platform: "kijiji",
          action: "update",
          outcome: "success",
          detail: { note: "price changed" },
          screenshot_path: null,
        },
        {
          created_at: "2026-06-22T10:00:00Z",
          lespac_id: null,
          platform: null,
          action: "sync",
          outcome: "success",
          detail: {},
          screenshot_path: null,
        },
      ],
    });

    const data = await fetchBotDashboard(supabase);

    expect(data.activity).toHaveLength(2);
    expect(data.activity[0]).toMatchObject({
      ts: "2026-06-22T11:30:00Z",
      lespacId: "L1",
      platform: "kijiji",
      action: "update",
      outcome: "success",
    });
    expect(data.activity[1].lespacId).toBeNull();
    expect(data.activity[1].platform).toBeNull();
  });

  it("computes lastSyncAt from latest bot_event.created_at and nextSyncAt = lastSyncAt + syncIntervalSec", async () => {
    const supabase = makeSupabase({
      platform_session: [],
      lespac_listing: [],
      platform_publication: [],
      bot_event: [
        {
          created_at: "2026-06-22T11:00:00Z",
          lespac_id: null,
          platform: null,
          action: "sync",
          outcome: "success",
          detail: {},
          screenshot_path: null,
        },
      ],
    });

    const data = await fetchBotDashboard(supabase);

    expect(data.lastSyncAt).toBe("2026-06-22T11:00:00Z");
    expect(data.nextSyncAt).toBe(
      new Date(Date.parse("2026-06-22T11:00:00Z") + 3600_000).toISOString(),
    );
  });

  it("returns null lastSyncAt and nextSyncAt when no bot_event rows", async () => {
    const supabase = makeSupabase({
      platform_session: [],
      lespac_listing: [],
      platform_publication: [],
      bot_event: [],
    });

    const data = await fetchBotDashboard(supabase);

    expect(data.lastSyncAt).toBeNull();
    expect(data.nextSyncAt).toBeNull();
  });
});
