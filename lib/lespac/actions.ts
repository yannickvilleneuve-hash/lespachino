"use server";

import { createClient } from "@/lib/supabase/server";
import { isLespacReady } from "./config";
import { syncAllToLespac, type SyncResult } from "./sync";

async function requireAuth() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Non authentifié");
}

export type SyncLespacResult =
  | { ok: true; results: SyncResult[] }
  | { ok: false; error: string };

export async function runLespacSync(): Promise<SyncLespacResult> {
  await requireAuth();
  if (!isLespacReady()) {
    return { ok: false, error: "Clé API Lespac ou identité concessionnaire manquante. Voir .env.local." };
  }
  try {
    const results = await syncAllToLespac();
    return { ok: true, results };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
