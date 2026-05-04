import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateLeadWorkflow } from "@/lib/leads/admin-actions";
import AppHeader from "@/app/app-header";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("fr-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function LeadsPage() {
  const admin = createAdminClient();
  const { data: leads, error } = await admin
    .from("lead")
    .select("id, unit, name, phone, email, message, status, assigned_to_email, notes, next_follow_up_at, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`leads: ${error.message}`);

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader
        title="Leads"
        right={
          <>
            <span className="text-xs text-white/70">{leads.length} lead{leads.length > 1 ? "s" : ""}</span>
            <Link href="/inventaire" className="text-xs text-white/70 hover:text-white">
              ← Inventaire
            </Link>
            <form action="/auth/signout" method="post">
              <button type="submit" className="text-xs text-white/70 hover:text-white">
                Déconnexion
              </button>
            </form>
          </>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Unité</th>
              <th className="px-3 py-2 text-left">Nom</th>
              <th className="px-3 py-2 text-left">Téléphone</th>
              <th className="px-3 py-2 text-left">Courriel</th>
              <th className="px-3 py-2 text-left">Message</th>
              <th className="px-3 py-2 text-left">Suivi</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {leads.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                  Aucun lead pour l&apos;instant.
                </td>
              </tr>
            )}
            {leads.map((l) => (
              <tr key={l.id} className="border-t align-top hover:bg-blue-50">
                <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                  {dateFmt.format(new Date(l.created_at))}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  <Link
                    href={`/inventaire/${encodeURIComponent(l.unit)}`}
                    className="text-blue-700 hover:underline"
                  >
                    {l.unit}
                  </Link>
                </td>
                <td className="px-3 py-2 font-medium">{l.name}</td>
                <td className="px-3 py-2">
                  {l.phone ? (
                    <a href={`tel:${l.phone}`} className="text-blue-700 hover:underline">
                      {l.phone}
                    </a>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {l.email ? (
                    <a href={`mailto:${l.email}`} className="text-blue-700 hover:underline">
                      {l.email}
                    </a>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2 max-w-md whitespace-pre-wrap text-sm text-gray-700">
                  {l.message || <span className="text-gray-400">—</span>}
                </td>
                <td className="px-3 py-2 min-w-[280px]">
                  <form action={updateLeadWorkflow} className="space-y-2">
                    <input type="hidden" name="id" value={l.id} />
                    <div className="flex gap-2">
                      <select
                        name="status"
                        defaultValue={l.status ?? "new"}
                        className="border rounded px-2 py-1 text-xs bg-white"
                      >
                        <option value="new">Nouveau</option>
                        <option value="contacted">Contacté</option>
                        <option value="follow_up">À relancer</option>
                        <option value="won">Gagné</option>
                        <option value="lost">Perdu</option>
                      </select>
                      <input
                        type="datetime-local"
                        name="next_follow_up_at"
                        defaultValue={toDateTimeLocal(l.next_follow_up_at)}
                        className="border rounded px-2 py-1 text-xs"
                      />
                    </div>
                    <textarea
                      name="notes"
                      defaultValue={l.notes ?? ""}
                      rows={2}
                      placeholder="Notes de suivi"
                      className="w-full border rounded px-2 py-1 text-xs"
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] text-gray-400 truncate">
                        {l.assigned_to_email ? `Assigné: ${l.assigned_to_email}` : "Non assigné"}
                      </span>
                      <button
                        type="submit"
                        className="px-2 py-1 rounded bg-blue-700 text-white text-xs hover:bg-blue-800"
                      >
                        Sauver
                      </button>
                    </div>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function toDateTimeLocal(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
