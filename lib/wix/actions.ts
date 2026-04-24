"use server";

import { createClient } from "@/lib/supabase/server";
import { isWixReady } from "./config";
import { syncAllToWix, type SyncResult } from "./sync";

async function requireAuth() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Non authentifié");
}

export type SyncWixResult =
  | { ok: true; results: SyncResult[] }
  | { ok: false; error: string };

export async function runWixSync(): Promise<SyncWixResult> {
  await requireAuth();
  if (!isWixReady()) {
    return { ok: false, error: "Variables Wix manquantes (WIX_API_TOKEN + WIX_SITE_ID)." };
  }
  try {
    const results = await syncAllToWix();
    return { ok: true, results };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
