"use server";

import { headers } from "next/headers";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendGraphEmail } from "@/lib/graph/mail";
import { leadFormSchema } from "./schema";

export type LeadResult = { ok: true } | { ok: false; error: string };

const LEAD_INBOX = process.env.GRAPH_FROM ?? "service@camion-hino.ca";

// Rate limit in-memory: 5 leads / heure / IP. Reset par redémarrage (pm2) = OK
// pour MVP. Plus tard: Supabase table ou Redis si multi-instance.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const rateLimitByIp = new Map<string, number[]>();

function checkRateLimit(ipHash: string | null): boolean {
  if (!ipHash) return true; // pas d'IP = dev/proxy weird → on laisse passer
  const now = Date.now();
  const history = (rateLimitByIp.get(ipHash) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  if (history.length >= RATE_LIMIT_MAX) {
    rateLimitByIp.set(ipHash, history);
    return false;
  }
  history.push(now);
  rateLimitByIp.set(ipHash, history);
  return true;
}

function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

async function listAuthEmails(): Promise<string[]> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
    return data.users.map((u) => u.email).filter((e): e is string => Boolean(e));
  } catch {
    return [];
  }
}

function renderLeadEmail(args: {
  unit: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  message?: string | null;
}): string {
  const { unit, name, phone, email, message } = args;
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const editUrl = `/inventaire/${encodeURIComponent(unit)}`;
  return `<!doctype html>
<html><body style="font-family:Arial,sans-serif;max-width:560px;margin:18px auto;color:#222;">
<h2 style="margin:0 0 12px 0;font-size:18px;">Nouveau lead — unit <strong>${esc(unit)}</strong></h2>
<table cellpadding="6" style="border-collapse:collapse;font-size:14px;width:100%;">
  <tr><td style="color:#666;white-space:nowrap;">Nom</td><td><strong>${esc(name)}</strong></td></tr>
  <tr><td style="color:#666;">Téléphone</td><td>${phone ? `<a href="tel:${esc(phone)}">${esc(phone)}</a>` : "—"}</td></tr>
  <tr><td style="color:#666;">Courriel</td><td>${email ? `<a href="mailto:${esc(email)}">${esc(email)}</a>` : "—"}</td></tr>
  <tr><td style="color:#666;vertical-align:top;">Message</td><td style="white-space:pre-wrap;">${message ? esc(message) : "<em>(aucun)</em>"}</td></tr>
</table>
<p style="margin-top:16px;"><a href="${editUrl}"
  style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:8px 14px;border-radius:4px;">
  Ouvrir la fiche ${esc(unit)}
</a></p>
<p style="color:#888;font-size:12px;border-top:1px solid #eee;padding-top:10px;margin-top:20px;">
  Généré automatiquement depuis <code>camion-hino.ca</code> (catalogue public).
</p>
</body></html>`;
}

export async function submitLead(formData: FormData): Promise<LeadResult> {
  const raw = {
    unit: String(formData.get("unit") ?? ""),
    name: String(formData.get("name") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    email: String(formData.get("email") ?? ""),
    message: String(formData.get("message") ?? ""),
    website: String(formData.get("website") ?? ""),
  };
  const parsed = leadFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  // Honeypot silencieusement ignoré — pas d'indication au bot.
  if (parsed.data.website) return { ok: true };

  const hdrs = await headers();
  const userAgent = hdrs.get("user-agent")?.slice(0, 300) ?? null;
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0].trim() ?? hdrs.get("x-real-ip") ?? null;
  const ipHash = hashIp(ip);

  if (!checkRateLimit(ipHash)) {
    return { ok: false, error: "Trop de demandes — réessaye plus tard." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("lead").insert({
    unit: parsed.data.unit,
    name: parsed.data.name,
    phone: parsed.data.phone || null,
    email: parsed.data.email || null,
    message: parsed.data.message || "",
    user_agent: userAgent,
    ip_hash: ipHash,
  });
  if (error) return { ok: false, error: `Erreur enregistrement: ${error.message}` };

  try {
    const cc = await listAuthEmails();
    await sendGraphEmail({
      to: LEAD_INBOX,
      cc: cc.filter((e) => e.toLowerCase() !== LEAD_INBOX.toLowerCase()),
      subject: `Lead ${parsed.data.unit} — ${parsed.data.name}`,
      html: renderLeadEmail(parsed.data),
    });
  } catch (err) {
    // Row déjà créée; juste l'email qui a planté — on log mais on ne casse pas l'UX user.
    console.error("lead email failed", err);
  }

  return { ok: true };
}
