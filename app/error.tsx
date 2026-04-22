"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[client error]", error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold mb-2">Oups.</h1>
        <p className="text-gray-600 mb-4">
          Une erreur est survenue. On a été notifié.
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-gray-400 mb-4">#{error.digest}</p>
        )}
        <button
          type="button"
          onClick={reset}
          className="bg-blue-700 text-white px-4 py-2 rounded text-sm hover:bg-blue-800"
        >
          Recharger
        </button>
      </div>
    </main>
  );
}
