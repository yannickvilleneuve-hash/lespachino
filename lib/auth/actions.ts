"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendGraphEmail } from "@/lib/graph/mail";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type InviteResult =
  | { ok: true }
  | { ok: false; error: string };

async function requireUserEmail(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) throw new Error("Non authentifié");
  return data.user.email;
}

function renderInviteEmail(actionLink: string, fullName: string | null): string {
  const greeting = fullName ? `Bonjour ${fullName},` : "Bonjour,";
  return `<!doctype html>
<html><body style="font-family:Arial,sans-serif;max-width:520px;margin:20px auto;color:#222;">
<p style="font-size:16px">${greeting}</p>
<p>Tu as été invité à <strong>Ventes — Centre du camion Hino</strong>.</p>
<p>Clique le bouton ci-dessous pour activer ton accès&nbsp;:</p>
<p style="text-align:center;margin:28px 0;">
  <a href="${actionLink}"
     style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;">
    Se connecter
  </a>
</p>
<p style="color:#555;font-size:13px">
  Si le bouton ne fonctionne pas, copie-colle cette adresse&nbsp;:<br>
  <a href="${actionLink}">${actionLink}</a>
</p>
<p style="color:#888;font-size:12px;margin-top:30px;border-top:1px solid #eee;padding-top:12px;">
  Lien à usage unique. Pour des connexions futures, va sur la page de
  connexion et redemande un lien magique.
</p>
</body></html>`;
}

export async function inviteUser(formData: FormData): Promise<InviteResult> {
  const inviter = await requireUserEmail();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim() || null;
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Courriel invalide" };

  const admin = createAdminClient();

  const { error: insertError } = await admin.from("app_user").upsert({
    email,
    full_name: fullName,
    invited_by: inviter,
  });
  if (insertError) return { ok: false, error: `insert: ${insertError.message}` };

  const hdrs = await headers();
  const host = hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  if (!host) return { ok: false, error: "Host inconnu" };
  const origin = `${proto}://${host}`;

  const { data, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (linkError || !data?.properties?.action_link) {
    return {
      ok: false,
      error: linkError?.message ?? "Impossible de générer le lien",
    };
  }

  try {
    await sendGraphEmail({
      to: email,
      subject: "Invitation — Ventes Centre du camion Hino",
      html: renderInviteEmail(data.properties.action_link, fullName),
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  revalidatePath("/dashboard/users");
  return { ok: true };
}

export async function removeUser(email: string): Promise<void> {
  const me = await requireUserEmail();
  if (email.toLowerCase() === me.toLowerCase()) {
    throw new Error("Tu ne peux pas te retirer toi-même.");
  }
  const admin = createAdminClient();
  const { error } = await admin.from("app_user").delete().eq("email", email.toLowerCase());
  if (error) throw new Error(`remove: ${error.message}`);
  revalidatePath("/dashboard/users");
}
