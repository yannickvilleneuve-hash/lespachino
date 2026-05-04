"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/audit/log";

const LEAD_STATUSES = new Set(["new", "contacted", "follow_up", "won", "lost"]);

export async function updateLeadWorkflow(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "new");
  const notes = String(formData.get("notes") ?? "");
  const nextFollowUpRaw = String(formData.get("next_follow_up_at") ?? "");
  if (!id) throw new Error("Lead id manquant");
  if (!LEAD_STATUSES.has(status)) throw new Error("Statut lead invalide");

  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error("Non authentifié");

  const now = new Date().toISOString();
  const update: {
    status: string;
    notes: string;
    assigned_to_email: string | null;
    next_follow_up_at: string | null;
    last_contacted_at?: string;
    closed_at?: string | null;
  } = {
    status,
    notes: notes.trim(),
    assigned_to_email: auth.user.email ?? null,
    next_follow_up_at: nextFollowUpRaw ? new Date(nextFollowUpRaw).toISOString() : null,
  };
  if (status === "contacted" || status === "follow_up") update.last_contacted_at = now;
  if (status === "won" || status === "lost") update.closed_at = now;
  if (status === "new") update.closed_at = null;

  const { error } = await supabase.from("lead").update(update).eq("id", id);
  if (error) throw new Error(`update lead: ${error.message}`);

  await logActivity({
    userEmail: auth.user.email ?? null,
    action: "update_lead",
    targetType: "lead",
    targetId: id,
    details: {
      status,
      next_follow_up_at: update.next_follow_up_at,
    },
  });
  revalidatePath("/inventaire/leads");
  revalidatePath("/inventaire");
}
