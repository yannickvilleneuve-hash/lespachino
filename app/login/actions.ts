"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendGraphEmail } from "@/lib/graph/mail";

export type LoginResult =
  | { ok: true }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function renderMagicLinkEmail(actionLink: string): string {
  return `<!doctype html>
<html><body style="font-family:Arial,sans-serif;max-width:520px;margin:20px auto;color:#222;">
<p style="font-size:16px">Bonjour,</p>
<p>Cliquez sur le bouton ci-dessous pour vous connecter à <strong>Ventes — Centre du camion Hino</strong>&nbsp;:</p>
<p style="text-align:center;margin:28px 0;">
  <a href="${actionLink}"
     style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;">
    Se connecter
  </a>
</p>
<p style="color:#555;font-size:13px">
  Si le bouton ne fonctionne pas, copie-colle cette adresse dans ton navigateur&nbsp;:<br>
  <a href="${actionLink}">${actionLink}</a>
</p>
<p style="color:#888;font-size:12px;margin-top:30px;border-top:1px solid #eee;padding-top:12px;">
  Ce lien expire après un seul usage. Si tu n'as pas demandé cette connexion, ignore ce courriel.
</p>
</body></html>`;
}

export async function sendMagicLink(formData: FormData): Promise<LoginResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Courriel invalide" };
  }

  const hdrs = await headers();
  const host = hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  if (!host) return { ok: false, error: "Host inconnu" };
  const origin = `${proto}://${host}`;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error || !data?.properties?.action_link) {
    return { ok: false, error: error?.message ?? "Impossible de générer le lien" };
  }

  try {
    await sendGraphEmail({
      to: email,
      subject: "Connexion — Ventes Centre du camion Hino",
      html: renderMagicLinkEmail(data.properties.action_link),
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  return { ok: true };
}
