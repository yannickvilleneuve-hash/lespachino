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
