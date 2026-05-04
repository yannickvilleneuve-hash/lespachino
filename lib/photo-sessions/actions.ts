"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateVariants, variantPath } from "@/lib/photos/resize";
import { logActivity } from "@/lib/audit/log";

const PHOTO_BUCKET = "vehicle-photos";
const MAX_PHOTOS_PER_UNIT = 30;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const SESSION_TTL_MIN = 30;
const SESSION_MAX_UPLOADS = 30;

export interface CreateSessionResult {
  token: string;
  url: string;
  expires_at: string;
}

/** Crée une session de capture mobile pour un véhicule. Retourne le token,
 *  l'URL complète à scanner via QR, et la date d'expiration. */
export async function createPhotoSession(unit: string): Promise<CreateSessionResult> {
  const supabase = await createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth.user) throw new Error("Non authentifié");

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MIN * 60 * 1000).toISOString();

  const { error } = await supabase.from("photo_session").insert({
    token,
    unit,
    expires_at: expiresAt,
    created_by: auth.user.id,
    max_uploads: SESSION_MAX_UPLOADS,
  });
  if (error) throw new Error(`create session: ${error.message}`);

  const base = process.env.ADMIN_SITE_URL || "https://ventes.hinochicoutimi.com";
  return {
    token,
    url: `${base}/capture/${token}`,
    expires_at: expiresAt,
  };
}

export interface ValidateSessionResult {
  ok: boolean;
  unit?: string;
  expires_at?: string;
  remaining_uploads?: number;
  reason?: "not_found" | "expired" | "exhausted";
}

/** Valide un token côté serveur. Pas d'auth requis — c'est tout l'intérêt
 *  du flow QR. Lit avec service_role pour bypass RLS sur photo_session. */
export async function validatePhotoSession(token: string): Promise<ValidateSessionResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("photo_session")
    .select("unit, expires_at, max_uploads, used_count")
    .eq("token", token)
    .maybeSingle();
  if (error || !data) return { ok: false, reason: "not_found" };
  if (new Date(data.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (data.used_count >= data.max_uploads) {
    return { ok: false, reason: "exhausted" };
  }
  return {
    ok: true,
    unit: data.unit,
    expires_at: data.expires_at,
    remaining_uploads: data.max_uploads - data.used_count,
  };
}

export type UploadResult =
  | { ok: true; id: string; url_thumb: string }
  | { ok: false; error: string };

/** Upload une photo via une session active. Anonyme — l'auth se fait via
 *  le token de la session. service_role bypass RLS pour insert dans
 *  vehicle_photo + storage. */
export async function uploadPhotoBySession(
  token: string,
  formData: FormData,
): Promise<UploadResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "no_file" };
  if (!ALLOWED_MIME.has(file.type)) return { ok: false, error: `type non supporté: ${file.type}` };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `fichier trop gros (${Math.round(file.size / 1024 / 1024)} MB > 15 MB)` };
  }

  const admin = createAdminClient();

  // Vérifie + claim la session atomiquement pour éviter les uploads concurrents
  // au-delà de max_uploads.
  const { data: session, error: sErr } = await admin
    .rpc("claim_photo_session_upload", { p_token: token })
    .maybeSingle();
  if (sErr) return { ok: false, error: `session: ${sErr.message}` };
  if (!session) return { ok: false, error: "session introuvable, expirée ou limite atteinte" };

  const unit = session.unit;

  // Cap global photos/véhicule.
  const { count } = await admin
    .from("vehicle_photo")
    .select("*", { count: "exact", head: true })
    .eq("unit", unit);
  if ((count ?? 0) >= MAX_PHOTOS_PER_UNIT) {
    return { ok: false, error: "véhicule a déjà 30 photos" };
  }

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().slice(0, 8);
  const id = crypto.randomUUID();
  const path = `${unit}/${id}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  let variants;
  try {
    variants = await generateVariants(buffer);
  } catch (err) {
    return { ok: false, error: `resize: ${(err as Error).message}` };
  }
  const thumbPath = variantPath(path, "thumb");
  const mediumPath = variantPath(path, "medium");

  const [origUp, thumbUp, medUp] = await Promise.all([
    admin.storage.from(PHOTO_BUCKET).upload(path, buffer, { contentType: file.type }),
    admin.storage.from(PHOTO_BUCKET).upload(thumbPath, variants.thumb, { contentType: "image/webp" }),
    admin.storage.from(PHOTO_BUCKET).upload(mediumPath, variants.medium, { contentType: "image/webp" }),
  ]);
  if (origUp.error || thumbUp.error || medUp.error) {
    await admin.storage.from(PHOTO_BUCKET).remove([path, thumbPath, mediumPath]);
    return {
      ok: false,
      error: `upload: ${origUp.error?.message ?? thumbUp.error?.message ?? medUp.error?.message}`,
    };
  }

  const isFirst = (count ?? 0) === 0;
  const { error: insertErr } = await admin.from("vehicle_photo").insert({
    id,
    unit,
    storage_path: path,
    position: count ?? 0,
    is_hero: isFirst,
    uploaded_by: session.created_by,
  });
  if (insertErr) {
    await admin.storage.from(PHOTO_BUCKET).remove([path, thumbPath, mediumPath]);
    return { ok: false, error: `insert: ${insertErr.message}` };
  }

  await logActivity({
    userEmail: null,
    action: "upload_photo_mobile",
    targetType: "photo",
    targetId: id,
    details: { unit, session_token_prefix: token.slice(0, 8), size: file.size },
  });

  revalidatePath(`/inventaire/${unit}`);
  revalidatePath("/inventaire");

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const url_thumb = base
    ? `${base}/storage/v1/object/public/${PHOTO_BUCKET}/${thumbPath}`
    : "";
  return { ok: true, id, url_thumb };
}
