"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendGraphEmail } from "@/lib/graph/mail";

/**
 * Public lead capture from a vehicle page. A visitor asks about a specific
 * truck; we persist the lead (RLS lets anon INSERT) and email the dealer.
 *
 * Anti-spam: in-memory 5/h/IP (single pm2 fork instance — no shared store
 * needed). The IP is only ever stored hashed (ip_hash), never in clear.
 */

const LEAD_TO = process.env.LEAD_TO_EMAIL ?? "info@camion-hino.ca";
const FEED_ORIGIN = process.env.FEED_ORIGIN ?? "https://feeds.hinochicoutimi.com";
const RATE_LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;

const hits = new Map<string, number[]>();

function rateLimited(ipHash: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ipHash) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(ipHash, recent);
    return true;
  }
  recent.push(now);
  hits.set(ipHash, recent);
  return false;
}

const LeadSchema = z.object({
  unit: z.string().trim().min(1),
  name: z.string().trim().min(1, "Nom requis").max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  email: z.email("Courriel invalide").max(160).or(z.literal("")).optional(),
  message: z.string().trim().max(2000).optional().or(z.literal("")),
});

export interface LeadState {
  ok: boolean;
  message: string;
}

export async function submitLead(
  _prev: LeadState,
  formData: FormData,
): Promise<LeadState> {
  // formData.get returns null for absent fields; zod .optional() wants undefined.
  const field = (k: string): string | undefined => {
    const v = formData.get(k);
    return typeof v === "string" ? v : undefined;
  };
  const parsed = LeadSchema.safeParse({
    unit: field("unit"),
    name: field("name"),
    phone: field("phone"),
    email: field("email"),
    message: field("message"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }
  const { unit, name, phone, email, message } = parsed.data;

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const userAgent = h.get("user-agent") ?? null;
  const ipHash = createHash("sha256").update(ip).digest("hex").slice(0, 32);

  if (rateLimited(ipHash)) {
    return { ok: false, message: "Trop de demandes. Réessayez plus tard." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("lead").insert({
    unit,
    name,
    phone: phone || null,
    email: email || null,
    message: message || "",
    user_agent: userAgent,
    ip_hash: ipHash,
  });
  if (error) {
    console.error("[lead] insert failed:", error.message);
    return { ok: false, message: "Erreur à l'envoi. Réessayez ou appelez-nous." };
  }

  const url = `${FEED_ORIGIN}/vehicule/${encodeURIComponent(unit)}`;
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  try {
    await sendGraphEmail({
      to: LEAD_TO,
      subject: `Nouveau lead — ${name} (véhicule ${unit})`,
      html:
        `<p><b>Nouveau message depuis la fiche véhicule.</b></p>` +
        `<p><b>Véhicule :</b> <a href="${url}">${esc(unit)}</a><br>` +
        `<b>Nom :</b> ${esc(name)}<br>` +
        `<b>Téléphone :</b> ${phone ? esc(phone) : "—"}<br>` +
        `<b>Courriel :</b> ${email ? esc(email) : "—"}</p>` +
        `<p><b>Message :</b><br>${message ? esc(message).replace(/\n/g, "<br>") : "—"}</p>`,
    });
  } catch (e) {
    // Lead is already saved; a mail hiccup shouldn't lose it or block the user.
    console.error("[lead] email failed:", (e as Error).message);
  }

  return { ok: true, message: "Merci! Votre message a été envoyé, nous vous répondrons rapidement." };
}
