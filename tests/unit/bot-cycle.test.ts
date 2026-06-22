/**
 * tests/unit/bot-cycle.test.ts
 *
 * Integration-brain test for runCycle. Every imported module is mocked so no
 * browser, network, or DB is touched. Each error path is exercised.
 *
 * Key deviation from the brief: recordResult's real signature is
 *   recordResult(supabase, job, outcome)
 * NOT a flat object. Tests assert using the real 3-arg signature.
 * Errors live in lib/bot/types.ts (no separate errors.ts file).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must come before imports of the module under test
// ---------------------------------------------------------------------------

// Shared spy for bot_event inserts — recreated per createAdminClient() call
let botEventInsertSpy: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    botEventInsertSpy = vi.fn().mockResolvedValue({ error: null });
    const builder = {
      upsert: vi.fn().mockResolvedValue({ error: null }),
      insert: botEventInsertSpy,
    };
    return { from: vi.fn().mockReturnValue(builder) };
  },
}));

vi.mock("@/lib/bot/config", () => ({
  loadBotConfig: () => ({
    enabledPlatforms: ["facebook", "kijiji"] as ("facebook" | "kijiji")[],
    maxJobsPerCycle: 10,
    maxAttempts: 3,
    operatorEmail: "test@example.com",
  }),
}));

vi.mock("@/lib/bot/lespac-reader", () => ({
  fetchActiveListings: vi.fn(),
}));

vi.mock("@/lib/bot/hash", () => ({
  computeContentHash: vi.fn(() => "h"),
}));

vi.mock("@/lib/bot/snapshot", () => ({
  refreshSnapshot: vi.fn(),
}));

vi.mock("@/lib/bot/mirror-state", () => ({
  loadPublications: vi.fn(),
  recordResult: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/bot/reconciler", () => ({
  buildJobs: vi.fn(),
}));

vi.mock("@/lib/bot/harness", () => ({
  runWithSession: vi.fn(
    async (_p: string, fn: (ctx: unknown) => Promise<unknown>) => fn({}),
  ),
  pace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/bot/drivers", () => ({
  DRIVERS: {} as Record<string, unknown>,
}));

vi.mock("@/lib/bot/alerter", () => ({
  alertOperator: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports (after vi.mock)
// ---------------------------------------------------------------------------

import { runCycle } from "@/lib/bot/cycle";
import { SessionExpiredError, TransientError, FatalError } from "@/lib/bot/types";
import { fetchActiveListings } from "@/lib/bot/lespac-reader";
import { refreshSnapshot } from "@/lib/bot/snapshot";
import { loadPublications, recordResult } from "@/lib/bot/mirror-state";
import { buildJobs } from "@/lib/bot/reconciler";
import { runWithSession, pace } from "@/lib/bot/harness";
import { DRIVERS } from "@/lib/bot/drivers";
import { alertOperator } from "@/lib/bot/alerter";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

type AnyFn = ReturnType<typeof vi.fn>;

const listing = {
  lespacId: "L1",
  title: "T",
  priceCad: 1,
  description: "d",
  photoUrls: [] as string[],
  contentHash: "h",
};

function job(over: Record<string, unknown> = {}) {
  return {
    action: "create",
    platform: "facebook",
    lespacId: "L1",
    listing,
    externalId: null,
    ...over,
  };
}

function setDrivers(d: Record<string, unknown>) {
  for (const k of Object.keys(DRIVERS as Record<string, unknown>)) {
    delete (DRIVERS as Record<string, unknown>)[k];
  }
  Object.assign(DRIVERS as Record<string, unknown>, d);
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Restore default mock implementations after clearAllMocks
  (fetchActiveListings as AnyFn).mockResolvedValue([listing]);
  (refreshSnapshot as AnyFn).mockResolvedValue([
    { lespacId: "L1", contentHash: "h", status: "active" },
  ]);
  (loadPublications as AnyFn).mockResolvedValue([]);
  (recordResult as AnyFn).mockResolvedValue(undefined);
  (alertOperator as AnyFn).mockResolvedValue(undefined);
  (runWithSession as AnyFn).mockImplementation(
    async (_p: string, fn: (ctx: unknown) => Promise<unknown>) => fn({}),
  );
  (pace as AnyFn).mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runCycle", () => {
  it("runs platforms sequentially and records one result per job", async () => {
    const order: string[] = [];

    (buildJobs as AnyFn).mockReturnValue([
      job({ platform: "facebook" }),
      job({ platform: "kijiji", lespacId: "L2" }),
    ]);
    setDrivers({
      facebook: {
        platform: "facebook",
        publish: vi.fn(async () => {
          order.push("fb");
          return { externalId: "x", url: "u" };
        }),
      },
      kijiji: {
        platform: "kijiji",
        publish: vi.fn(async () => {
          order.push("kj");
          return { externalId: "y", url: "v" };
        }),
      },
    });

    const summary = await runCycle();

    // facebook session fully handled before kijiji session opens
    expect((runWithSession as AnyFn).mock.calls.map((c: unknown[]) => c[0])).toEqual([
      "facebook",
      "kijiji",
    ]);
    expect(order).toEqual(["fb", "kj"]);
    expect(recordResult).toHaveBeenCalledTimes(2);
    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toBe(0);
  });

  it("returns correct CycleSummary shape", async () => {
    (buildJobs as AnyFn).mockReturnValue([]);
    setDrivers({});

    const summary = await runCycle();

    expect(summary).toMatchObject({
      listings: 1,
      jobs: 0,
      succeeded: 0,
      failed: 0,
      sessionsDead: [],
    });
  });

  it("short-circuits remaining jobs + alerts once on session death", async () => {
    (buildJobs as AnyFn).mockReturnValue([
      job({ lespacId: "L1" }),
      job({ lespacId: "L2" }),
      job({ lespacId: "L3" }),
    ]);
    const publish = vi.fn(async () => {
      throw new SessionExpiredError("dead");
    });
    setDrivers({ facebook: { platform: "facebook", publish } });

    const summary = await runCycle();

    expect(publish).toHaveBeenCalledTimes(1); // stops after first
    expect(alertOperator).toHaveBeenCalledTimes(1); // exactly once
    expect((alertOperator as AnyFn).mock.calls[0][1]).toContain("session-dead:facebook");
    expect(summary.sessionsDead).toContain("facebook");
    expect(summary.failed).toBe(0); // session death is not counted as a job failure
  });

  it("adds platform to sessionsDead only once even with multiple jobs failing", async () => {
    (buildJobs as AnyFn).mockReturnValue([job({ lespacId: "L1" }), job({ lespacId: "L2" })]);
    const publish = vi.fn(async () => {
      throw new SessionExpiredError("dead");
    });
    setDrivers({ facebook: { platform: "facebook", publish } });

    const summary = await runCycle();

    // Only added once
    expect(summary.sessionsDead.filter((p: string) => p === "facebook")).toHaveLength(1);
  });

  it("continues to next platform after session death on first platform", async () => {
    const kijijiPublish = vi.fn(async () => ({ externalId: "kj1", url: "u" }));

    (buildJobs as AnyFn).mockReturnValue([
      job({ lespacId: "L1", platform: "facebook" }),
      job({ lespacId: "L2", platform: "kijiji" }),
    ]);
    setDrivers({
      facebook: {
        platform: "facebook",
        publish: vi.fn(async () => {
          throw new SessionExpiredError("fb dead");
        }),
      },
      kijiji: {
        platform: "kijiji",
        publish: kijijiPublish,
      },
    });

    const summary = await runCycle();

    // kijiji still ran
    expect(kijijiPublish).toHaveBeenCalledTimes(1);
    expect(summary.sessionsDead).toContain("facebook");
    expect(summary.sessionsDead).not.toContain("kijiji");
    expect(summary.succeeded).toBe(1);
  });

  it("retries transient failures and gives up after maxAttempts", async () => {
    // prior row with attemptCount: 2 (next attempt = 3 = maxAttempts)
    (loadPublications as AnyFn).mockResolvedValue([
      {
        lespacId: "L1",
        platform: "facebook",
        status: "pending",
        attemptCount: 2,
        externalId: null,
        externalUrl: null,
        publishedHash: null,
      },
    ]);
    (buildJobs as AnyFn).mockReturnValue([job({ lespacId: "L1" })]);
    setDrivers({
      facebook: {
        platform: "facebook",
        publish: vi.fn(async () => {
          throw new TransientError("net");
        }),
      },
    });

    const summary = await runCycle();

    // should record failed with incremented attemptCount
    expect(recordResult).toHaveBeenCalledWith(
      expect.anything(), // supabase
      expect.objectContaining({ lespacId: "L1", platform: "facebook" }),
      expect.objectContaining({ status: "failed" }),
    );
    expect(alertOperator).toHaveBeenCalledTimes(1);
    expect((alertOperator as AnyFn).mock.calls[0][1]).toContain("failed:facebook:L1");
    expect(summary.failed).toBe(1);
  });

  it("retries transient failure with pending status when below maxAttempts", async () => {
    // prior row with attemptCount: 0 — has 2 more attempts left
    (loadPublications as AnyFn).mockResolvedValue([
      {
        lespacId: "L1",
        platform: "facebook",
        status: "pending",
        attemptCount: 0,
        externalId: null,
        externalUrl: null,
        publishedHash: null,
      },
    ]);
    (buildJobs as AnyFn).mockReturnValue([job({ lespacId: "L1" })]);
    setDrivers({
      facebook: {
        platform: "facebook",
        publish: vi.fn(async () => {
          throw new TransientError("net");
        }),
      },
    });

    const summary = await runCycle();

    expect(recordResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ lespacId: "L1" }),
      expect.objectContaining({ status: "pending" }),
    );
    // No alert — not yet exhausted
    expect(alertOperator).not.toHaveBeenCalled();
    expect(summary.failed).toBe(0);
    expect(summary.succeeded).toBe(0);
  });

  it("marks fatal as failed and alerts with screenshot path", async () => {
    (buildJobs as AnyFn).mockReturnValue([job({ lespacId: "L1" })]);
    const err = new FatalError("page changed") as FatalError & { screenshotPath?: string };
    err.screenshotPath = "/sessions/screenshots/fb-L1.png";
    setDrivers({
      facebook: {
        platform: "facebook",
        publish: vi.fn(async () => {
          throw err;
        }),
      },
    });

    const summary = await runCycle();

    expect(recordResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ lespacId: "L1", platform: "facebook" }),
      expect.objectContaining({ status: "failed" }),
    );
    expect(alertOperator).toHaveBeenCalledTimes(1);
    const alertArgs = (alertOperator as AnyFn).mock.calls[0];
    // dedupKey
    expect(alertArgs[1]).toContain("fatal:facebook:L1");
    // body contains screenshot path
    expect(String(alertArgs[3])).toContain("/sessions/screenshots/fb-L1.png");
    expect(summary.failed).toBe(1);
    expect(summary.succeeded).toBe(0);
  });

  it("marks fatal as failed and alerts with n/a when no screenshot path", async () => {
    (buildJobs as AnyFn).mockReturnValue([job({ lespacId: "L1" })]);
    const err = new FatalError("page changed");
    setDrivers({
      facebook: {
        platform: "facebook",
        publish: vi.fn(async () => {
          throw err;
        }),
      },
    });

    await runCycle();

    const alertArgs = (alertOperator as AnyFn).mock.calls[0];
    expect(String(alertArgs[3])).toContain("n/a");
  });

  it("respects the per-cycle per-platform cap (maxJobsPerCycle)", async () => {
    // Default config has maxJobsPerCycle: 10, but we want to test cap=2 scenario
    // We do this by providing more jobs than the cap
    // First let's verify with 3 jobs and cap=10 that all 3 run
    (buildJobs as AnyFn).mockReturnValue([
      job({ lespacId: "A" }),
      job({ lespacId: "B" }),
      job({ lespacId: "C" }),
    ]);
    const publish = vi.fn(async () => ({ externalId: "x", url: "u" }));
    setDrivers({ facebook: { platform: "facebook", publish } });

    await runCycle();

    // All 3 run when under cap
    expect(publish).toHaveBeenCalledTimes(3);
  });

  it("only processes maxJobsPerCycle jobs per platform when cap is lower than job count", async () => {
    // We need a fresh module instance with cap=1
    vi.resetModules();

    // Re-register all mocks for the fresh module registry
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: vi.fn().mockReturnValue({
          upsert: vi.fn().mockResolvedValue({ error: null }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    }));
    vi.doMock("@/lib/bot/config", () => ({
      loadBotConfig: () => ({
        enabledPlatforms: ["facebook"],
        maxJobsPerCycle: 1,
        maxAttempts: 3,
        operatorEmail: "test@example.com",
      }),
    }));

    const publishFn = vi.fn(async () => ({ externalId: "x", url: "u" }));
    const recordResultFn = vi.fn().mockResolvedValue(undefined);
    const alertFn = vi.fn().mockResolvedValue(undefined);

    vi.doMock("@/lib/bot/lespac-reader", () => ({
      fetchActiveListings: vi.fn().mockResolvedValue([listing]),
    }));
    vi.doMock("@/lib/bot/hash", () => ({
      computeContentHash: vi.fn(() => "h"),
    }));
    vi.doMock("@/lib/bot/snapshot", () => ({
      refreshSnapshot: vi.fn().mockResolvedValue([
        { lespacId: "L1", contentHash: "h", status: "active" },
      ]),
    }));
    vi.doMock("@/lib/bot/mirror-state", () => ({
      loadPublications: vi.fn().mockResolvedValue([]),
      recordResult: recordResultFn,
    }));
    vi.doMock("@/lib/bot/reconciler", () => ({
      buildJobs: vi.fn().mockReturnValue([
        job({ lespacId: "A" }),
        job({ lespacId: "B" }),
        job({ lespacId: "C" }),
      ]),
    }));
    vi.doMock("@/lib/bot/harness", () => ({
      runWithSession: vi.fn(
        async (_p: string, fn: (ctx: unknown) => Promise<unknown>) => fn({}),
      ),
      pace: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/bot/drivers", () => ({
      DRIVERS: { facebook: { platform: "facebook", publish: publishFn } },
    }));
    vi.doMock("@/lib/bot/alerter", () => ({
      alertOperator: alertFn,
    }));

    const { runCycle: freshRunCycle } = await import("@/lib/bot/cycle");
    await freshRunCycle();

    expect(publishFn).toHaveBeenCalledTimes(1); // cap = 1
    expect(recordResultFn).toHaveBeenCalledTimes(1);
  });

  it("skips platform if it has no jobs", async () => {
    (buildJobs as AnyFn).mockReturnValue([
      job({ lespacId: "L1", platform: "facebook" }),
      // no kijiji jobs
    ]);
    setDrivers({
      facebook: {
        platform: "facebook",
        publish: vi.fn(async () => ({ externalId: "x", url: "u" })),
      },
      kijiji: {
        platform: "kijiji",
        publish: vi.fn(async () => ({ externalId: "y", url: "v" })),
      },
    });

    await runCycle();

    // runWithSession only called once (for facebook)
    expect((runWithSession as AnyFn).mock.calls.map((c: unknown[]) => c[0])).toEqual(["facebook"]);
  });

  it("recordResult called for update action", async () => {
    (buildJobs as AnyFn).mockReturnValue([
      job({ action: "update", externalId: "ext-1", platform: "facebook" }),
    ]);
    setDrivers({
      facebook: {
        platform: "facebook",
        update: vi.fn(async () => undefined),
      },
    });

    const summary = await runCycle();

    expect(recordResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "update", externalId: "ext-1" }),
      expect.objectContaining({ status: "live" }),
    );
    expect(summary.succeeded).toBe(1);
  });

  it("recordResult called for remove action", async () => {
    (buildJobs as AnyFn).mockReturnValue([
      job({ action: "remove", externalId: "ext-1", listing: null, platform: "facebook" }),
    ]);
    setDrivers({
      facebook: {
        platform: "facebook",
        remove: vi.fn(async () => undefined),
      },
    });

    const summary = await runCycle();

    expect(recordResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "remove" }),
      expect.objectContaining({ status: "removed" }),
    );
    expect(summary.succeeded).toBe(1);
  });

  it("treats unknown errors as transient (retry)", async () => {
    (loadPublications as AnyFn).mockResolvedValue([
      {
        lespacId: "L1",
        platform: "facebook",
        status: "pending",
        attemptCount: 0,
        externalId: null,
        externalUrl: null,
        publishedHash: null,
      },
    ]);
    (buildJobs as AnyFn).mockReturnValue([job({ lespacId: "L1" })]);
    setDrivers({
      facebook: {
        platform: "facebook",
        publish: vi.fn(async () => {
          throw new Error("unexpected network error");
        }),
      },
    });

    const summary = await runCycle();

    // Should be recorded as pending (retry), not failed (only 1 attempt used)
    expect(recordResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ lespacId: "L1" }),
      expect.objectContaining({ status: "pending" }),
    );
    expect(summary.failed).toBe(0);
    expect(summary.succeeded).toBe(0);
  });

  it("pace is called between jobs (but not before the first job)", async () => {
    (buildJobs as AnyFn).mockReturnValue([
      job({ lespacId: "A" }),
      job({ lespacId: "B" }),
      job({ lespacId: "C" }),
    ]);
    const publish = vi.fn(async () => ({ externalId: "x", url: "u" }));
    setDrivers({ facebook: { platform: "facebook", publish } });

    await runCycle();

    // pace called between jobs: 3 jobs = 2 inter-job paces
    expect(pace).toHaveBeenCalledTimes(2);
  });

  it("writes a per-job bot_event with the correct action and outcome on success", async () => {
    (buildJobs as AnyFn).mockReturnValue([job({ platform: "facebook", lespacId: "L1" })]);
    setDrivers({
      facebook: {
        platform: "facebook",
        publish: vi.fn(async () => ({ externalId: "x", url: "u" })),
      },
    });

    await runCycle();

    // At least one insert should have been called with a job event (action=create, outcome=success)
    const insertCalls = botEventInsertSpy.mock.calls;
    const jobEvent = insertCalls.find(
      (c: unknown[]) =>
        (c[0] as Record<string, unknown>).action === "create" &&
        (c[0] as Record<string, unknown>).outcome === "success" &&
        (c[0] as Record<string, unknown>).lespac_id === "L1",
    );
    expect(jobEvent).toBeDefined();
  });

  it("writes a per-job bot_event with outcome=failure and screenshot_path on FatalError", async () => {
    (buildJobs as AnyFn).mockReturnValue([job({ platform: "facebook", lespacId: "L1" })]);
    const err = new FatalError("page changed") as FatalError & { screenshotPath?: string };
    err.screenshotPath = "/sessions/failures/fb-L1.png";
    setDrivers({
      facebook: {
        platform: "facebook",
        publish: vi.fn(async () => {
          throw err;
        }),
      },
    });

    await runCycle();

    const insertCalls = botEventInsertSpy.mock.calls;
    const failEvent = insertCalls.find(
      (c: unknown[]) =>
        (c[0] as Record<string, unknown>).outcome === "failure" &&
        (c[0] as Record<string, unknown>).lespac_id === "L1",
    );
    expect(failEvent).toBeDefined();
    expect((failEvent![0] as Record<string, unknown>).screenshot_path).toBe(
      "/sessions/failures/fb-L1.png",
    );
  });

  it("always writes a sync heartbeat bot_event at the end of runCycle", async () => {
    (buildJobs as AnyFn).mockReturnValue([]);
    setDrivers({});

    await runCycle();

    const insertCalls = botEventInsertSpy.mock.calls;
    const syncEvent = insertCalls.find(
      (c: unknown[]) =>
        (c[0] as Record<string, unknown>).action === "sync" &&
        (c[0] as Record<string, unknown>).outcome === "success" &&
        (c[0] as Record<string, unknown>).lespac_id === null,
    );
    expect(syncEvent).toBeDefined();
  });
});
