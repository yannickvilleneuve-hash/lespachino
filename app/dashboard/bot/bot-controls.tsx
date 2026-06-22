"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Platform } from "@/lib/bot/types";
import { syncNow, uploadSession } from "./actions";

export default function BotControls({
  lastSyncAt,
  nextSyncAt,
  platforms,
}: {
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  platforms: Platform[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>(
    platforms[0] ?? "facebook",
  );
  const fileRef = useRef<HTMLInputElement>(null);

  function doSync() {
    setMessage(null);
    startTransition(async () => {
      const res = await syncNow();
      setMessage(res.message);
      if (res.ok) router.refresh();
    });
  }

  function doUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setMessage("Choisir un fichier sessions/<platform>.json.");
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const res = await uploadSession(platform, file);
      setMessage(res.message);
      if (res.ok) {
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      }
    });
  }

  const fmt = (v: string | null) =>
    v
      ? new Intl.DateTimeFormat("fr-CA", {
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(v))
      : "—";

  return (
    <div className="flex flex-col gap-4">
      {/* Sync times */}
      <div className="text-sm text-slate-600">
        <div>
          Dernière sync :{" "}
          <span className="font-medium text-slate-900">{fmt(lastSyncAt)}</span>
        </div>
        <div>
          Prochaine sync :{" "}
          <span className="font-medium text-slate-900">{fmt(nextSyncAt)}</span>
        </div>
      </div>

      {/* Sync now */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={doSync}
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending ? "Sync en cours…" : "Synchroniser maintenant"}
        </button>
      </div>

      {/* Session re-upload */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as Platform)}
          disabled={pending}
          className="rounded-md border border-slate-300 px-2 py-2 text-sm disabled:opacity-50"
        >
          {platforms.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          disabled={pending}
          className="text-sm disabled:opacity-50"
        />
        <button
          type="button"
          onClick={doUpload}
          disabled={pending}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          Ré-uploader session
        </button>
      </div>

      {/* Feedback message */}
      {message && (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {message}
        </p>
      )}
    </div>
  );
}
