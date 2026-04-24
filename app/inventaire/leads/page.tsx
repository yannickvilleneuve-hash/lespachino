import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
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
    .select("id, unit, name, phone, email, message, created_at")
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
          </>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Unit</th>
              <th className="px-3 py-2 text-left">Nom</th>
              <th className="px-3 py-2 text-left">Téléphone</th>
              <th className="px-3 py-2 text-left">Courriel</th>
              <th className="px-3 py-2 text-left">Message</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {leads.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
