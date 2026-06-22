import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadPublications, recordResult } from "@/lib/bot/mirror-state";
import type { Job } from "@/lib/bot/types";

type DbRow = Record<string, unknown>;

// Captures the last upsert call so tests can assert the written payload.
interface Capture {
  selectRows: DbRow[]; // rows returned by select("*")
  eqRow: DbRow | null; // row returned for the (lespac_id, platform) read in recordResult
  upsert: { payload: DbRow; options: Record<string, unknown> | undefined } | null;
}

function makeSupabase(capture: Capture) {
  return {
    from(_table: string) {
      return {
        // loadPublications path: select("*") is awaited directly
        select(_cols: string) {
          const chain = {
            // recordResult read path: .eq().eq().maybeSingle()
            eq() {
              return chain;
            },
            maybeSingle() {
              return Promise.resolve({ data: capture.eqRow, error: null });
            },
            then(resolve: (v: { data: DbRow[]; error: null }) => unknown) {
              return Promise.resolve({ data: capture.selectRows, error: null }).then(resolve);
            },
          };
          return chain;
        },
        upsert(payload: DbRow, options?: Record<string, unknown>) {
          capture.upsert = { payload, options };
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  } as unknown as Parameters<typeof loadPublications>[0];
}

function job(overrides: Partial<Job> = {}): Job {
  return {
    action: "create",
    platform: "facebook",
    lespacId: "A",
    listing: {
      lespacId: "A",
      title: "Truck A",
      priceCad: 50000,
      description: "d",
      photoUrls: [],
      contentHash: "h1",
    },
    externalId: null,
    ...overrides,
  };
}

describe("loadPublications", () => {
  let capture: Capture;
  beforeEach(() => {
    capture = { selectRows: [], eqRow: null, upsert: null };
  });

  it("maps DB snake_case rows to camelCase PublicationRow", async () => {
    capture.selectRows = [
      {
        lespac_id: "A",
        platform: "facebook",
        status: "live",
        external_url: "https://facebook/ad/fb-1",
        external_id: "fb-1",
        published_hash: "h1",
        attempt_count: 3,
      },
    ];
    const rows = await loadPublications(makeSupabase(capture));
    expect(rows).toEqual([
      {
        lespacId: "A",
        platform: "facebook",
        status: "live",
        externalUrl: "https://facebook/ad/fb-1",
        externalId: "fb-1",
        publishedHash: "h1",
        attemptCount: 3,
      },
    ]);
  });

  it("defaults attempt_count to 0 when null", async () => {
    capture.selectRows = [
      {
        lespac_id: "B",
        platform: "kijiji",
        status: "pending",
        external_url: null,
        external_id: null,
        published_hash: null,
        attempt_count: null,
      },
    ];
    const rows = await loadPublications(makeSupabase(capture));
    expect(rows[0].attemptCount).toBe(0);
    expect(rows[0].externalUrl).toBeNull();
  });

  it("returns [] when no rows", async () => {
    const rows = await loadPublications(makeSupabase(capture));
    expect(rows).toEqual([]);
  });
});

describe("recordResult", () => {
  let capture: Capture;
  beforeEach(() => {
    capture = { selectRows: [], eqRow: null, upsert: null };
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("upserts keyed on (lespac_id, platform) with onConflict", async () => {
    await recordResult(makeSupabase(capture), job(), { status: "pending" });
    expect(capture.upsert).not.toBeNull();
    expect(capture.upsert!.options).toMatchObject({ onConflict: "lespac_id,platform" });
    expect(capture.upsert!.payload).toMatchObject({
      lespac_id: "A",
      platform: "facebook",
    });
  });

  it("writes status, last_action, error_message and timestamps", async () => {
    await recordResult(makeSupabase(capture), job({ action: "update", externalId: "fb-1" }), {
      status: "failed",
      error: "page changed",
    });
    const p = capture.upsert!.payload;
    expect(p.status).toBe("failed");
    expect(p.last_action).toBe("update");
    expect(p.error_message).toBe("page changed");
    expect(p.last_attempt_at).toBe("2026-06-22T12:00:00.000Z");
    // not a success → last_success_at not set to now
    expect(p.last_success_at ?? null).toBeNull();
  });

  it("increments attempt_count from the existing row", async () => {
    capture.eqRow = { attempt_count: 2 };
    await recordResult(makeSupabase(capture), job(), { status: "live", externalId: "fb-1" });
    expect(capture.upsert!.payload.attempt_count).toBe(3);
  });

  it("starts attempt_count at 1 when no existing row", async () => {
    capture.eqRow = null;
    await recordResult(makeSupabase(capture), job(), { status: "pending" });
    expect(capture.upsert!.payload.attempt_count).toBe(1);
  });

  it("records external_id/url/published_hash and last_success_at on a live result", async () => {
    await recordResult(makeSupabase(capture), job({ action: "create" }), {
      status: "live",
      externalId: "fb-1",
      externalUrl: "https://facebook/ad/fb-1",
      publishedHash: "h1",
    });
    const p = capture.upsert!.payload;
    expect(p.status).toBe("live");
    expect(p.external_id).toBe("fb-1");
    expect(p.external_url).toBe("https://facebook/ad/fb-1");
    expect(p.published_hash).toBe("h1");
    expect(p.last_success_at).toBe("2026-06-22T12:00:00.000Z");
    expect(p.error_message ?? null).toBeNull();
  });

  it("clears error_message to null when outcome has no error", async () => {
    await recordResult(makeSupabase(capture), job(), { status: "live", externalId: "fb-1" });
    expect(capture.upsert!.payload.error_message ?? null).toBeNull();
  });
});
