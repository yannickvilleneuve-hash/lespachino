import { describe, it, expect } from "vitest";
import { buildJobs } from "@/lib/bot/reconciler";
import type { SnapshotRow } from "@/lib/bot/snapshot";
import type { MirrorListing, Platform } from "@/lib/bot/types";
import type { PublicationRow } from "@/lib/bot/mirror-state";

const ALL: Platform[] = ["facebook", "kijiji", "autotrader"];

function listing(lespacId: string, contentHash: string): MirrorListing {
  return {
    lespacId,
    title: `Truck ${lespacId}`,
    priceCad: 50000,
    description: "desc",
    photoUrls: [`https://img/${lespacId}.jpg`],
    contentHash,
  };
}

function snap(lespacId: string, contentHash: string, status: "active" | "gone"): SnapshotRow {
  return { lespacId, contentHash, status };
}

function pub(
  lespacId: string,
  platform: Platform,
  status: PublicationRow["status"],
  publishedHash: string | null,
  externalId: string | null,
): PublicationRow {
  return {
    lespacId,
    platform,
    status,
    externalUrl: externalId ? `https://${platform}/ad/${externalId}` : null,
    externalId,
    publishedHash,
    attemptCount: 1,
  };
}

// Build the snapshotListings map from a list of MirrorListings.
function asMap(...ls: MirrorListing[]): Map<string, MirrorListing> {
  return new Map(ls.map((l) => [l.lespacId, l]));
}

describe("buildJobs — CREATE", () => {
  it("new active listing with no publications → one CREATE per enabled platform", () => {
    const l = listing("A", "h1");
    const jobs = buildJobs([snap("A", "h1", "active")], [], asMap(l), ALL);
    expect(jobs).toHaveLength(3);
    for (const platform of ALL) {
      const job = jobs.find((j) => j.platform === platform);
      expect(job).toBeDefined();
      expect(job!).toEqual({
        action: "create",
        platform,
        lespacId: "A",
        listing: l,
        externalId: null,
      });
    }
  });

  it("respects the enabled list — only enabled platforms get jobs", () => {
    const l = listing("A", "h1");
    const jobs = buildJobs([snap("A", "h1", "active")], [], asMap(l), ["facebook"]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].platform).toBe("facebook");
    expect(jobs[0].action).toBe("create");
  });

  it("only the missing platform gets a CREATE when another is already live & current", () => {
    const l = listing("A", "h1");
    const mirror = [pub("A", "facebook", "live", "h1", "fb-1")];
    const jobs = buildJobs([snap("A", "h1", "active")], mirror, asMap(l), ["facebook", "kijiji"]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toEqual({
      action: "create",
      platform: "kijiji",
      lespacId: "A",
      listing: l,
      externalId: null,
    });
  });

  it("active listing with a 'removed' publication → re-CREATE", () => {
    const l = listing("A", "h1");
    const mirror = [pub("A", "facebook", "removed", "h1", "fb-1")];
    const jobs = buildJobs([snap("A", "h1", "active")], mirror, asMap(l), ["facebook"]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toEqual({
      action: "create",
      platform: "facebook",
      lespacId: "A",
      listing: l,
      externalId: null,
    });
  });

  it("active listing with a 'failed' publication → re-CREATE (re-attempt next cycle)", () => {
    const l = listing("A", "h1");
    const mirror = [pub("A", "facebook", "failed", null, null)];
    const jobs = buildJobs([snap("A", "h1", "active")], mirror, asMap(l), ["facebook"]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].action).toBe("create");
    expect(jobs[0].externalId).toBeNull();
    expect(jobs[0].listing).toEqual(l);
  });
});

describe("buildJobs — UPDATE", () => {
  it("live publication with stale hash → UPDATE carrying externalId", () => {
    const l = listing("A", "h2"); // snapshot now h2
    const mirror = [pub("A", "facebook", "live", "h1", "fb-1")]; // published h1
    const jobs = buildJobs([snap("A", "h2", "active")], mirror, asMap(l), ["facebook"]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toEqual({
      action: "update",
      platform: "facebook",
      lespacId: "A",
      listing: l,
      externalId: "fb-1",
    });
  });

  it("price change yields UPDATE only (no create/remove)", () => {
    const l = listing("A", "h2");
    const mirror = [
      pub("A", "facebook", "live", "h1", "fb-1"),
      pub("A", "kijiji", "live", "h1", "kj-1"),
    ];
    const jobs = buildJobs([snap("A", "h2", "active")], mirror, asMap(l), ["facebook", "kijiji"]);
    expect(jobs).toHaveLength(2);
    expect(jobs.every((j) => j.action === "update")).toBe(true);
    expect(jobs.map((j) => j.externalId).sort()).toEqual(["fb-1", "kj-1"]);
  });
});

describe("buildJobs — REMOVE", () => {
  it("gone listing with a live publication → REMOVE carrying externalId, listing null", () => {
    const mirror = [pub("A", "facebook", "live", "h1", "fb-1")];
    const jobs = buildJobs([snap("A", "h1", "gone")], mirror, asMap(), ["facebook"]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toEqual({
      action: "remove",
      platform: "facebook",
      lespacId: "A",
      listing: null,
      externalId: "fb-1",
    });
  });

  it("gone listing with a live publication on each platform → REMOVE per live platform", () => {
    const mirror = [
      pub("A", "facebook", "live", "h1", "fb-1"),
      pub("A", "kijiji", "live", "h1", "kj-1"),
    ];
    const jobs = buildJobs([snap("A", "h1", "gone")], mirror, asMap(), ALL);
    expect(jobs).toHaveLength(2);
    expect(jobs.every((j) => j.action === "remove")).toBe(true);
    expect(jobs.every((j) => j.listing === null)).toBe(true);
  });

  it("gone listing with no live publication → no jobs", () => {
    const mirror = [
      pub("A", "facebook", "removed", "h1", "fb-1"),
      pub("A", "kijiji", "failed", null, null),
    ];
    const jobs = buildJobs([snap("A", "h1", "gone")], mirror, asMap(), ALL);
    expect(jobs).toEqual([]);
  });

  it("gone listing never mirrored → no jobs", () => {
    const jobs = buildJobs([snap("A", "h1", "gone")], [], asMap(), ALL);
    expect(jobs).toEqual([]);
  });
});

describe("buildJobs — pending skip", () => {
  it("active listing with a 'pending' publication → no job (in flight)", () => {
    const l = listing("A", "h1");
    const mirror = [pub("A", "facebook", "pending", null, null)];
    const jobs = buildJobs([snap("A", "h1", "active")], mirror, asMap(l), ["facebook"]);
    expect(jobs).toEqual([]);
  });

  it("gone listing with a 'pending' publication → no job (in flight)", () => {
    const mirror = [pub("A", "facebook", "pending", null, null)];
    const jobs = buildJobs([snap("A", "h1", "gone")], mirror, asMap(), ["facebook"]);
    expect(jobs).toEqual([]);
  });
});

describe("buildJobs — idempotency", () => {
  it("up-to-date mirror (all live, hashes match) → zero jobs", () => {
    const l = listing("A", "h1");
    const mirror = ALL.map((p) => pub("A", p, "live", "h1", `${p}-1`));
    const jobs = buildJobs([snap("A", "h1", "active")], mirror, asMap(l), ALL);
    expect(jobs).toEqual([]);
  });

  it("running buildJobs twice against an up-to-date mirror yields zero jobs both times", () => {
    const l = listing("A", "h1");
    const mirror = ALL.map((p) => pub("A", p, "live", "h1", `${p}-1`));
    const snapshot = [snap("A", "h1", "active")];
    const map = asMap(l);
    expect(buildJobs(snapshot, mirror, map, ALL)).toEqual([]);
    expect(buildJobs(snapshot, mirror, map, ALL)).toEqual([]);
  });
});

describe("buildJobs — mixed scenario", () => {
  it("create + update + remove + skip in one pass", () => {
    // A: new active (no pubs)           → CREATE x2
    // B: active, fb live stale, kj live current → UPDATE fb only
    // C: gone, fb live                  → REMOVE fb
    // D: active, fb pending             → skip
    const lA = listing("A", "h1");
    const lB = listing("B", "h2new");
    const lD = listing("D", "h4");
    const snapshot = [
      snap("A", "h1", "active"),
      snap("B", "h2new", "active"),
      snap("C", "h3", "gone"),
      snap("D", "h4", "active"),
    ];
    const mirror = [
      pub("B", "facebook", "live", "h2old", "fb-B"),
      pub("B", "kijiji", "live", "h2new", "kj-B"),
      pub("C", "facebook", "live", "h3", "fb-C"),
      pub("D", "facebook", "pending", null, null),
    ];
    const map = asMap(lA, lB, lD);
    const jobs = buildJobs(snapshot, mirror, map, ["facebook", "kijiji"]);

    const creates = jobs.filter((j) => j.action === "create");
    const updates = jobs.filter((j) => j.action === "update");
    const removes = jobs.filter((j) => j.action === "remove");

    // A → create on both enabled platforms; D → create on kijiji (fb is pending-skipped)
    expect(creates.map((j) => `${j.lespacId}:${j.platform}`).sort()).toEqual([
      "A:facebook",
      "A:kijiji",
      "D:kijiji",
    ]);
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ lespacId: "B", platform: "facebook", externalId: "fb-B" });
    expect(removes).toHaveLength(1);
    expect(removes[0]).toMatchObject({ lespacId: "C", platform: "facebook", externalId: "fb-C", listing: null });
  });
});

describe("buildJobs — empty inputs", () => {
  it("empty snapshot → no jobs", () => {
    expect(buildJobs([], [], asMap(), ALL)).toEqual([]);
  });

  it("empty enabled list → no jobs even with active listings", () => {
    const l = listing("A", "h1");
    expect(buildJobs([snap("A", "h1", "active")], [], asMap(l), [])).toEqual([]);
  });
});
