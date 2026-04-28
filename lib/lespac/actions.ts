"use server";

import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/audit/log";
import { isLespacReady } from "./config";
import { syncAllToLespac, type SyncResult } from "./sync";

async function requireUserEmail(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Non authentifié");
  return data.user.email ?? null;
}

export type SyncLespacResult =
  | { ok: true; results: SyncResult[] }
  | { ok: false; error: string };

export async function runLespacSync(): Promise<SyncLespacResult> {
  const userEmail = await requireUserEmail();
  if (!isLespacReady()) {
    return { ok: false, error: "Clé API Lespac ou identité concessionnaire manquante. Voir .env.local." };
  }
  try {
    const results = await syncAllToLespac();
    const ok = results.filter((r) => r.action === "upserted" || r.action === "deactivated").length;
    const fail = results.filter((r) => r.action === "error").length;
    await logActivity({
      userEmail,
      action: "sync_lespac",
      targetType: "sync",
      details: { ok, fail, total: results.length },
    });
    return { ok: true, results };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
