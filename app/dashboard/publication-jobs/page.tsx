import Link from "next/link";
import AppHeader from "@/app/app-header";
import { createAdminClient } from "@/lib/supabase/admin";
import { retryPublicationJob } from "@/lib/listings/actions";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("fr-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  running: "En cours",
  succeeded: "Réussi",
  failed: "Échec",
  skipped: "Ignoré",
};

export default async function PublicationJobsPage() {
  const admin = createAdminClient();
  const { data: jobs, error } = await admin
    .from("publication_job")
    .select("id, unit, channel, action, status, attempts, last_error, next_retry_at, created_at, completed_at")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(`publication_job: ${error.message}`);

  return (
    <main className="min-h-screen bg-gray-50">
      <AppHeader
        title="Publication"
        right={
          <Link href="/dashboard" className="text-xs text-white/70 hover:text-white">
            ← Dashboard
          </Link>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-gray-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Unit</th>
              <th className="px-3 py-2 text-left">Canal</th>
              <th className="px-3 py-2 text-left">Action</th>
              <th className="px-3 py-2 text-left">État</th>
              <th className="px-3 py-2 text-left">Erreur</th>
              <th className="px-3 py-2 text-right">Relancer</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {jobs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                  Aucun job de publication.
                </td>
              </tr>
            )}
            {jobs.map((job) => (
              <tr key={job.id} className="border-t align-top">
                <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                  {dateFmt.format(new Date(job.created_at))}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  <Link
                    href={`/inventaire/${encodeURIComponent(job.unit)}`}
                    className="text-blue-700 hover:underline"
                  >
                    {job.unit}
                  </Link>
                </td>
                <td className="px-3 py-2">{job.channel}</td>
                <td className="px-3 py-2">{job.action}</td>
                <td className="px-3 py-2">
                  <StatusPill status={job.status} />{" "}
                  <span className="text-xs text-gray-400">essai {job.attempts}</span>
                </td>
                <td className="px-3 py-2 max-w-lg text-xs text-red-700">
                  {job.last_error || <span className="text-gray-400">—</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {(job.status === "failed" || job.status === "skipped") && (
                    <form action={retryPublicationJob.bind(null, job.id)}>
                      <button
                        type="submit"
                        className="px-2 py-1 rounded bg-blue-700 text-white text-xs hover:bg-blue-800"
                      >
                        Réessayer
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "succeeded"
      ? "bg-green-100 text-green-800"
      : status === "failed"
        ? "bg-red-100 text-red-800"
        : status === "running"
          ? "bg-blue-100 text-blue-800"
          : status === "skipped"
            ? "bg-amber-100 text-amber-800"
            : "bg-gray-100 text-gray-700";
  return (
    <span className={"inline-block px-2 py-0.5 rounded text-xs font-medium " + color}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
