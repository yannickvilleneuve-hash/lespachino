import type { SnapshotRow } from "@/lib/bot/snapshot";
import type { Job, MirrorListing, Platform } from "@/lib/bot/types";
import type { PublicationRow } from "@/lib/bot/mirror-state";

/**
 * Pure reconciler. Diffs a LesPAC snapshot against stored mirror state and
 * emits per-platform CREATE / UPDATE / REMOVE jobs. No I/O. Deterministic and
 * idempotent: re-running against an up-to-date mirror yields zero jobs.
 *
 * Rule table — see docs/superpowers/plans/_parts/03-reconciler-mirrorstate.md.
 */
export function buildJobs(
  snapshot: SnapshotRow[],
  mirror: PublicationRow[],
  snapshotListings: Map<string, MirrorListing>,
  enabled: Platform[],
): Job[] {
  // Index mirror rows by `${lespacId} ${platform}` for O(1) lookup.
  const pubByKey = new Map<string, PublicationRow>();
  for (const row of mirror) {
    pubByKey.set(key(row.lespacId, row.platform), row);
  }

  const jobs: Job[] = [];

  // Pass 1: active listings → CREATE / UPDATE (per enabled platform).
  for (const platform of enabled) {
    for (const row of snapshot) {
      if (row.status !== "active") continue;
      const pub = pubByKey.get(key(row.lespacId, platform));
      const listing = snapshotListings.get(row.lespacId);
      if (!listing) continue; // defensive: snapshot row without listing payload

      if (!pub || pub.status === "removed" || pub.status === "failed") {
        jobs.push({
          action: "create",
          platform,
          lespacId: row.lespacId,
          listing,
          externalId: null,
        });
        continue;
      }
      if (pub.status === "pending") continue; // in flight
      // pub.status === "live"
      if (pub.publishedHash !== row.contentHash) {
        jobs.push({
          action: "update",
          platform,
          lespacId: row.lespacId,
          listing,
          externalId: pub.externalId,
        });
      }
    }
  }

  // Pass 2: gone listings with a live publication → REMOVE (per enabled platform).
  for (const platform of enabled) {
    for (const row of snapshot) {
      if (row.status !== "gone") continue;
      const pub = pubByKey.get(key(row.lespacId, platform));
      if (pub && pub.status === "live") {
        jobs.push({
          action: "remove",
          platform,
          lespacId: row.lespacId,
          listing: null,
          externalId: pub.externalId,
        });
      }
    }
  }

  return jobs;
}

function key(lespacId: string, platform: Platform): string {
  return `${lespacId} ${platform}`;
}
