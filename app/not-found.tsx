import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-bold mb-2">404</h1>
        <p className="text-gray-600 mb-4">Cette page n&apos;existe pas ou plus.</p>
        <Link href="/" className="text-blue-700 hover:underline text-sm">
          ← Retour au catalogue
        </Link>
      </div>
    </main>
  );
}
