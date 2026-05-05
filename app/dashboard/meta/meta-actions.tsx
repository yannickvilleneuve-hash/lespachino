"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addReadyListingsToMetaFeed,
  triggerMetaFeedImport,
  type BulkMetaFeedResult,
} from "@/lib/meta/actions";

export default function MetaActions({ canImport }: { canImport: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function addReady() {
    setMessage(null);
    startTransition(async () => {
      try {
        const result: BulkMetaFeedResult = await addReadyListingsToMetaFeed();
        setMessage(
          `${result.added} ajouté${result.added > 1 ? "s" : ""} au feed Meta. ${result.already} déjà sélectionné${result.already > 1 ? "s" : ""}.`,
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
      const result = await triggerMetaFeedImport();
      setMessage(
        result.ok
          ? `Import Meta lancé${result.uploadId ? ` (${result.uploadId})` : ""}.`
          : result.error,
      );
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
        Ajouter prêts au feed Meta
      </button>
      <button
        type="button"
        onClick={importNow}
        disabled={pending || !canImport}
        className="rounded border border-blue-200 bg-white px-3 py-2 text-sm text-blue-800 hover:bg-blue-50 disabled:opacity-50"
      >
        Forcer import Meta
      </button>
      {message && <span className="text-sm text-gray-700">{message}</span>}
    </div>
  );
}
