import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { SertiStatus, Vehicle } from "@/lib/serti/wgi";

type Listing = Database["public"]["Tables"]["listing"]["Row"];

export interface StatusState {
  serti_status: SertiStatus;
  sold_at: string | null;
  quoted_at: string | null;
}

/** Jours écoulés depuis la vente (entier, plancher 0). null si pas vendu. */
export function soldDaysAgo(sold_at: string | null, now: Date = new Date()): number | null {
  if (!sold_at) return null;
  const ms = now.getTime() - new Date(sold_at).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

/**
 * Réconcilie les statuts SERTI observés avec ce que Supabase mémorise.
 * - Nouvelle ligne `listing` créée si absente (avec sold_at/quoted_at = now si applicable).
 * - Transition vers `sold` → stamp `sold_at = now()` (premier coup uniquement).
 * - Transition vers `quoted` → stamp `quoted_at = now()`.
 * - Retour: Map unit → état effectif (serti_status, sold_at, quoted_at).
 */
export async function reconcileStatuses(
  vehicles: Pick<Vehicle, "unit" | "status">[],
  supabase: SupabaseClient<Database>,
  now: Date = new Date(),
): Promise<Map<string, StatusState>> {
  const result = new Map<string, StatusState>();
  if (vehicles.length === 0) return result;

  const units = vehicles.map((v) => v.unit);
  const existingRes = await supabase
    .from("listing")
    .select("unit, serti_status, sold_at, quoted_at")
    .in("unit", units);
  if (existingRes.error) throw new Error(`reconcile fetch: ${existingRes.error.message}`);

  type Slim = Pick<Listing, "unit" | "serti_status" | "sold_at" | "quoted_at">;
  const existing = new Map<string, Slim>(
    (existingRes.data as Slim[]).map((r) => [r.unit, r]),
  );

  const nowIso = now.toISOString();
  type Upsert = Database["public"]["Tables"]["listing"]["Insert"];
  const upserts: Upsert[] = [];

  for (const v of vehicles) {
    const prev = existing.get(v.unit);
    const next: StatusState = {
      serti_status: v.status,
      sold_at: prev?.sold_at ?? null,
      quoted_at: prev?.quoted_at ?? null,
    };

    if (!prev) {
      if (v.status === "sold") next.sold_at = nowIso;
      if (v.status === "quoted") next.quoted_at = nowIso;
      upserts.push({
        unit: v.unit,
        serti_status: v.status,
        sold_at: next.sold_at,
        quoted_at: next.quoted_at,
      });
    } else if (prev.serti_status !== v.status) {
      if (v.status === "sold" && !prev.sold_at) next.sold_at = nowIso;
      if (v.status === "quoted") next.quoted_at = nowIso;
      upserts.push({
        unit: v.unit,
        serti_status: v.status,
        sold_at: next.sold_at,
        quoted_at: next.quoted_at,
      });
    }
    result.set(v.unit, next);
  }

  if (upserts.length > 0) {
    const upsertRes = await supabase
      .from("listing")
      .upsert(upserts, { onConflict: "unit" });
    if (upsertRes.error) throw new Error(`reconcile upsert: ${upsertRes.error.message}`);
  }

  return result;
}
