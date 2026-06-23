import type { SupabaseClient } from "@supabase/supabase-js";
import { sendGraphEmail } from "@/lib/graph/mail";
import { getBotConfig } from "@/lib/bot/config";

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function alertOperator(
  supabase: SupabaseClient,
  dedupKey: string,
  subject: string,
  body: string,
): Promise<void> {
  const cfg = await getBotConfig(supabase);
  const { operatorEmail } = cfg;
  if (!operatorEmail) {
    throw new Error("OPERATOR_EMAIL requis pour alertOperator");
  }

  const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
  const { data: recent } = await supabase
    .from("bot_event")
    .select("created_at, detail")
    .eq("action", "alert")
    .eq("detail->>dedupKey", dedupKey)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent) return; // already alerted within the dedup window

  const html = `<p>${escapeHtml(body).replace(/\n/g, "<br/>")}</p>`;
  await sendGraphEmail({ to: operatorEmail, subject, html });

  await supabase.from("bot_event").insert({
    lespac_id: null,
    platform: null,
    action: "alert",
    outcome: "sent",
    detail: { dedupKey, subject },
  });
}
