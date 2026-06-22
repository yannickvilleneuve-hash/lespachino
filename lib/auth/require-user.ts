"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Auth gate for dashboard server actions.
 * Throws if the caller has no active Supabase session.
 * Pattern matches `requireUserEmail()` in lib/auth/actions.ts.
 */
export async function requireAllowedUser(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) throw new Error("Non authentifié");
  return data.user.email;
}
