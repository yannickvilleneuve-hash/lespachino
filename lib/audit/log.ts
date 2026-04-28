import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

type ActivityLogInsert = Database["public"]["Tables"]["activity_log"]["Insert"];

export interface LogActivityArgs {
  userEmail: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: Record<string, unknown>;
}

/**
 * Append-only audit log. Best-effort — n'échoue jamais le code appelant
 * (les errors sont loggées mais avalées).
 */
export async function logActivity(args: LogActivityArgs): Promise<void> {
  const admin = createAdminClient();
  const row: ActivityLogInsert = {
    user_email: args.userEmail,
    action: args.action,
    target_type: args.targetType ?? null,
    target_id: args.targetId ?? null,
    details: (args.details ?? {}) as ActivityLogInsert["details"],
  };
  const { error } = await admin.from("activity_log").insert(row);
  if (error) {
    console.error(`activity_log insert failed: ${error.message}`, args);
  }
}
