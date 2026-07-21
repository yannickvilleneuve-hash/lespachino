/**
 * Scoped to /dashboard on purpose. Do NOT move this back to app/loading.tsx.
 *
 * A root loading.tsx makes every route stream, and Next returns HTTP 200 for a
 * streamed `notFound()` (it only injects <meta robots="noindex">). That turns
 * /vehicule/<sold-truck> into a soft 404, which Meta's catalog validator counts
 * as a live landing page. Keeping the public catalog non-streamed is what makes
 * its 404s real.
 */
export default function Loading() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="inline-block w-8 h-8 border-4 border-gray-200 border-t-blue-700 rounded-full animate-spin" />
        <p className="mt-3 text-sm text-gray-500">Chargement…</p>
      </div>
    </main>
  );
}
