import { createAdminClient } from "@/lib/supabase/admin";
import { fetchMetaImportAlert, type MetaImportAlert } from "@/lib/meta/diagnostics";

export interface InventoryAlerts {
  leadsRecent: number;
  syncErrorsRecent: number;
  metaImport: MetaImportAlert | null;
}

export async function fetchInventoryAlerts(): Promise<InventoryAlerts> {
  const admin = createAdminClient();
  const iso = (days: number) =>
    new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [leadsRes, errorsRes, metaImport] = await Promise.all([
    admin
      .from("lead")
      .select("id", { count: "exact", head: true })
      .eq("status", "new")
      .gte("created_at", iso(7)),
    admin
      .from("activity_log")
      .select("id", { count: "exact", head: true })
      .like("action", "sync_%")
      .filter("details->>action", "eq", "error")
      .gte("created_at", iso(1)),
    fetchMetaImportAlert(),
  ]);

  return {
    leadsRecent: leadsRes.count ?? 0,
    syncErrorsRecent: errorsRes.count ?? 0,
    metaImport,
  };
}
