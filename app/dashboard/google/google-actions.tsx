"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addReadyListingsToGoogleFeed,
  triggerGoogleVlaImport,
  type BulkGoogleFeedResult,
} from "@/lib/google/actions";

export default function GoogleActions({
  canImport,
  configured,
}: {
  canImport: boolean;
  configured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function addReady() {
    setMessage(null);
    startTransition(async () => {
      try {
        const result: BulkGoogleFeedResult = await addReadyListingsToGoogleFeed();
        setMessage(
          `${result.added} ajouté${result.added > 1 ? "s" : ""} au feed Google. ${result.already} déjà sélectionné${result.already > 1 ? "s" : ""}.`,
        );
        router.refresh();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function importNow() {
    setMessage(null);
    startTransition(async () => {
      const result = await triggerGoogleVlaImport();
      setMessage(result.ok ? "Import Google lancé." : result.error);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={addReady}
        disabled={pending}
        className="rounded bg-blue-700 px-3 py-2 text-sm text-white hover:bg-blue-800 disabled:opacity-50"
      >
        Ajouter prêts au feed Google
      </button>
      <button
        type="button"
        onClick={importNow}
        disabled={pending || !configured || !canImport}
        className="rounded border border-blue-200 bg-white px-3 py-2 text-sm text-blue-800 hover:bg-blue-50 disabled:opacity-50"
      >
        Forcer import Google
      </button>
      {message && <span className="text-sm text-gray-700">{message}</span>}
    </div>
  );
}
