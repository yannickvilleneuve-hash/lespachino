import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { NormalizedListing } from "@/lib/bot/types";
import { computeContentHash } from "@/lib/bot/hash";

export interface SnapshotRow {
  lespacId: string;
  contentHash: string;
  status: "active" | "gone";
}

/**
 * Refresh the lespac_listing snapshot for one sync cycle (spec §sync loop
 * step 2):
 *  1. upsert every pulled listing as status='active' with a recomputed
 *     content_hash and refreshed last_seen,
 *  2. flip any previously-active row absent from the pull to status='gone',
 *  3. return all current rows as SnapshotRow[].
 */
export async function refreshSnapshot(
  supabase: SupabaseClient<Database>,
  listings: NormalizedListing[],
): Promise<SnapshotRow[]> {
  const now = new Date().toISOString();
  const presentIds = listings.map((l) => l.lespacId);

  // Step 1: upsert all pulled listings as active with fresh hash + last_seen.
  if (listings.length > 0) {
    const rows = listings.map((l) => ({
      lespac_id: l.lespacId,
      title: l.title,
      price_cad: l.priceCad,
      description: l.description,
      photo_urls: l.photoUrls,
      content_hash: computeContentHash(l),
      status: "active" as const,
      last_seen: now,
    }));
    const { error } = await supabase
      .from("lespac_listing")
      .upsert(rows, { onConflict: "lespac_id" });
    if (error) throw new Error(`snapshot upsert failed: ${error.message}`);
  }

  // Step 2: Gone-detection — active rows absent from this pull → 'gone'.
  // Single query: UPDATE ... SET status='gone' WHERE status='active' [AND lespac_id NOT IN (...)]
  // When the pull is empty we skip the NOT IN clause and flip every active row.
  const goneBase = supabase
    .from("lespac_listing")
    .update({ status: "gone" })
    .eq("status", "active");

  // supabase-js loses the awaitable type across the conditional .not() chain;
  // one cast, one disable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const goneFilter = goneBase as any;
  const goneResult: { error?: unknown } = await (presentIds.length > 0
    ? goneFilter.not(
        "lespac_id",
        "in",
        `(${presentIds.map((id) => `"${id}"`).join(",")})`,
      )
    : goneFilter);

  if (goneResult?.error) {
    throw new Error(
      `snapshot gone-update failed: ${(goneResult.error as { message: string }).message}`,
    );
  }

  // Step 3: Return all current rows.
  const { data, error: selError } = await supabase
    .from("lespac_listing")
    .select("lespac_id, content_hash, status");
  if (selError) throw new Error(`snapshot select failed: ${selError.message}`);

  return (data ?? []).map((r) => ({
    lespacId: r.lespac_id,
    contentHash: r.content_hash,
    status: r.status as "active" | "gone",
  }));
}
