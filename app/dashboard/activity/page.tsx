import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AppHeader from "@/app/app-header";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("fr-CA", {
  dateStyle: "short",
  timeStyle: "short",
});

const ACTION_LABELS: Record<string, string> = {
  publish: "📢 Publier",
  unpublish: "🔕 Dépublier",
  edit_listing: "✏️ Édition fiche",
  upload_photo: "📷 Upload photo",
  delete_photo: "🗑️ Suppression photo",
  set_hero: "⭐ Photo principale",
  reorder_photos: "🔀 Réordonner photos",
  invite_user: "👤 Invitation user",
  remove_user: "❌ Retrait user",
  sync_wix: "🔄 Sync Wix",
  sync_lespac: "🔄 Sync Lespac",
  sync_meta: "🔄 Push Meta",
  sync_google: "🔄 Push Google",
  bulk_publish: "📦 Bulk publish",
  hide_listing: "👁️‍🗨️ Cacher",
  show_listing: "👁️ Afficher",
  login: "🔓 Connexion",
};

interface ActivityRow {
  id: string;
  user_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

function fmtDetails(action: string, details: Record<string, unknown>): string {
  if (action === "publish" || action === "unpublish" || action === "edit_listing") {
    const price = details.price_cad as number | undefined;
    const desc = details.description_fr as string | undefined;
    const parts: string[] = [];
    if (price) parts.push(`${price.toLocaleString("fr-CA")} $`);
    if (desc && desc.length > 0) parts.push(`"${desc.slice(0, 40)}${desc.length > 40 ? "…" : ""}"`);
    return parts.join(" · ");
  }
  if (action === "sync_wix" || action === "sync_lespac" || action === "sync_meta" || action === "sync_google") {
    const ok = details.ok as number | undefined;
    const fail = details.fail as number | undefined;
    if (ok != null && fail != null) return `${ok} OK · ${fail} échecs`;
  }
  if (action === "bulk_publish") {
    const published = details.published as number | undefined;
    const skipped = details.skipped as number | undefined;
    if (published != null) return `${published} publiés · ${skipped ?? 0} ignorés`;
  }
  if (action === "upload_photo" || action === "delete_photo") {
    return (details.unit as string | undefined) ?? "";
  }
  return "";
}

export default async function ActivityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`activity load: ${error.message}`);
  const rows = (data ?? []) as ActivityRow[];

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader
        title="Journal d'activité"
        right={
          <>
            <Link href="/dashboard" className="text-xs text-white/70 hover:text-white">
              ← Dashboard
            </Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-xs text-white/70 hover:text-white">
                Déconnexion
              </button>
            </form>
          </>
        }
      />

      <div className="max-w-5xl mx-auto p-6">
        <p className="text-sm text-gray-500 mb-3">
          200 dernières actions. Plus récent en haut.
        </p>
        <div className="bg-white border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-xs uppercase text-gray-600">
              <tr>
                <th className="text-left px-3 py-2 w-32">Quand</th>
                <th className="text-left px-3 py-2 w-44">Qui</th>
                <th className="text-left px-3 py-2 w-44">Action</th>
                <th className="text-left px-3 py-2 w-24">Cible</th>
                <th className="text-left px-3 py-2">Détails</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center px-3 py-8 text-gray-400">
                    Aucune activité enregistrée pour le moment.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">
                    {dateFmt.format(new Date(r.created_at))}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.user_email ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {ACTION_LABELS[r.action] ?? r.action}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.target_id ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {fmtDetails(r.action, r.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
