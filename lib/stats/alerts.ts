import { createAdminClient } from "@/lib/supabase/admin";

export interface InventoryAlerts {
  syncErrorsRecent: number;
}

export async function fetchInventoryAlerts(): Promise<InventoryAlerts> {
  const admin = createAdminClient();
  const iso = (days: number) =>
    new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const errorsRes = await admin
    .from("activity_log")
    .select("id", { count: "exact", head: true })
    .like("action", "sync_%")
    .filter("details->>action", "eq", "error")
    .gte("created_at", iso(1));

  return {
    syncErrorsRecent: errorsRes.count ?? 0,
  };
}
