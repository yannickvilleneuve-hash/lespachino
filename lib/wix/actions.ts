"use server";

import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/audit/log";
import { isWixReady } from "./config";
import { syncAllToWix, type SyncResult } from "./sync";

async function requireUserEmail(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Non authentifié");
  return data.user.email ?? null;
}

export type SyncWixResult =
  | { ok: true; results: SyncResult[] }
  | { ok: false; error: string };

export async function runWixSync(): Promise<SyncWixResult> {
  const userEmail = await requireUserEmail();
  if (!isWixReady()) {
    return { ok: false, error: "Variables Wix manquantes (WIX_API_TOKEN + WIX_SITE_ID)." };
  }
  try {
    const results = await syncAllToWix();
    const ok = results.filter((r) => r.action === "saved").length;
    const fail = results.filter((r) => r.action === "skipped" || r.action === "error").length;
    await logActivity({
      userEmail,
      action: "sync_wix",
      targetType: "sync",
      details: { ok, fail, total: results.length },
    });
    return { ok: true, results };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
