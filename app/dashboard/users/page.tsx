import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import AppHeader from "@/app/app-header";
import InviteForm from "./invite-form";
import RemoveButton from "./remove-button";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("fr-CA", {
  dateStyle: "medium",
});

export default async function UsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data: users, error } = await admin
    .from("app_user")
    .select("email, full_name, invited_by, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`load users: ${error.message}`);

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader
        title="Utilisateurs"
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

      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <section className="bg-white border rounded p-5">
          <h2 className="text-sm font-semibold mb-3">Inviter un utilisateur</h2>
          <InviteForm />
          <p className="text-xs text-gray-500 mt-3">
            Le courriel reçoit un lien magique pour activer son accès.
            Tous les utilisateurs ont accès complet à la plateforme.
          </p>
        </section>

        <section className="bg-white border rounded">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-xs uppercase text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">Courriel</th>
                <th className="text-left px-3 py-2">Nom</th>
                <th className="text-left px-3 py-2">Invité par</th>
                <th className="text-left px-3 py-2">Ajouté le</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.email} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{u.email}</td>
                  <td className="px-3 py-2">{u.full_name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{u.invited_by ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {dateFmt.format(new Date(u.created_at))}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {u.email !== user.email && <RemoveButton email={u.email} />}
                    {u.email === user.email && (
                      <span className="text-xs text-gray-400">(toi)</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
