import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Vérifie si un courriel est autorisé à se connecter (présent dans app_user).
 * Utilise service_role pour bypass RLS — l'appel se fait depuis server actions
 * publiques (anon) et /auth/callback.
 */
export async function isEmailAllowed(email: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("app_user")
    .select("email")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`whitelist check: ${error.message}`);
  return data !== null;
}
