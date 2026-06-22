import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { Job, Platform } from "@/lib/bot/types";

export interface PublicationRow {
  lespacId: string;
  platform: Platform;
  status: "pending" | "live" | "failed" | "removed";
  externalUrl: string | null;
  externalId: string | null;
  publishedHash: string | null;
  attemptCount: number;
}

const TABLE = "platform_publication";

/** Load all mirror rows and map DB snake_case → PublicationRow camelCase. */
export async function loadPublications(
  supabase: SupabaseClient<Database>,
): Promise<PublicationRow[]> {
  const { data, error } = await supabase.from(TABLE).select("*");
  if (error) {
    throw new Error(`loadPublications: ${error.message}`);
  }
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      lespacId: row.lespac_id as string,
      platform: row.platform as PublicationRow["platform"],
      status: row.status as PublicationRow["status"],
      externalUrl: (row.external_url as string | null) ?? null,
      externalId: (row.external_id as string | null) ?? null,
      publishedHash: (row.published_hash as string | null) ?? null,
      attemptCount: (row.attempt_count as number | null) ?? 0,
    };
  });
}

/**
 * Persist the outcome of a job. Upserts the (lespac_id, platform) row,
 * incrementing attempt_count from the current value (single-threaded per
 * key within a cycle, so read-then-write is race-free).
 */
export async function recordResult(
  supabase: SupabaseClient<Database>,
  job: Job,
  outcome: {
    status: PublicationRow["status"];
    externalId?: string;
    externalUrl?: string;
    publishedHash?: string;
    error?: string;
  },
): Promise<void> {
  const { data: existing } = await supabase
    .from(TABLE)
    .select("attempt_count")
    .eq("lespac_id", job.lespacId)
    .eq("platform", job.platform)
    .maybeSingle();

  const prevAttempts =
    ((existing as Record<string, unknown> | null)?.attempt_count as number | null) ?? 0;
  const now = new Date().toISOString();

  const payload: Record<string, unknown> = {
    lespac_id: job.lespacId,
    platform: job.platform,
    status: outcome.status,
    last_action: job.action,
    attempt_count: prevAttempts + 1,
    error_message: outcome.error ?? null,
    last_attempt_at: now,
  };
  if (outcome.externalId !== undefined) payload.external_id = outcome.externalId;
  if (outcome.externalUrl !== undefined) payload.external_url = outcome.externalUrl;
  if (outcome.publishedHash !== undefined) payload.published_hash = outcome.publishedHash;
  if (outcome.status === "live") payload.last_success_at = now;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from(TABLE) as any).upsert(payload, {
    onConflict: "lespac_id,platform",
  });
  if (error) {
    throw new Error(`recordResult ${job.lespacId}/${job.platform}: ${error.message}`);
  }
}
